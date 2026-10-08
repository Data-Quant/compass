// The model scores each submitted multiple-choice answer (one job per revision); HR then reviews every score. Jobs are
// claimed with a lease, retried twice on model errors, and failed into HR's queue after that.
import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { ModelError, type ModelResult, type StructuredModel } from '../ai/model'
import { anonymise, buildScoringMessages, finalizeScore, PROMPT_VERSION, SCORING_JSON_SCHEMA, SCORING_SCHEMA_NAME, scoringOutputSchema, type ScoringOutput } from '../ai/scoring-prompt'
import { parseOptions } from '../mcq'
import { perspectiveOf } from '../perspectives'
import { resolveActiveModel } from './ai-settings'
import { loadPeople } from './context'

export const MAX_ATTEMPTS = 3
export const LEASE_MS = 2 * 60 * 1000
export const RETRY_DELAYS_MS: readonly number[] = [5_000, 20_000]
/** Scoring right after a submit runs after the response is sent, within this budget. */
export const INLINE_BUDGET_MS = 60_000

interface ClaimedJob { id: string; responseId: string; revision: number; attempts: number; token: string }
type Outcome = 'SCORED' | 'RETRY' | 'FAILED' | 'STALE' | 'LOST_LEASE'
export interface ScoringRunSummary { scored: number; failed: number; remaining: number }

class LostLease extends Error {}

const scopeOf = (responseIds?: readonly string[]): Prisma.WeeklyScoringJobWhereInput => (responseIds ? { responseId: { in: [...responseIds] } } : {})

/** Queues the model for an answer's revision. Called inside the submit's transaction. */
export async function queueScoring(tx: Prisma.TransactionClient, responseId: string, revision: number): Promise<void> {
  await tx.weeklyScoringJob.updateMany({ where: { responseId, status: 'PENDING', revision: { not: revision } }, data: { status: 'CANCELLED' } })
  await tx.weeklyScoringJob.upsert({ where: { responseId_revision: { responseId, revision } }, create: { responseId, revision }, update: {} })
}

async function claimJobs(now: Date, limit: number, responseIds?: readonly string[]): Promise<ClaimedJob[]> {
  const scope = scopeOf(responseIds)
  // A worker that died holding the last attempt's lease will never finish: fail it into HR's queue.
  await prisma.weeklyScoringJob.updateMany({
    where: { ...scope, status: 'RUNNING', leaseUntil: { lt: now }, attempts: { gte: MAX_ATTEMPTS } },
    data: { status: 'FAILED', error: 'LEASE_EXPIRED', leaseToken: null, leaseUntil: null, updatedAt: now },
  })
  const candidates = await prisma.weeklyScoringJob.findMany({
    // A first attempt runs at once; a retry waits for its delay.
    where: { ...scope, attempts: { lt: MAX_ATTEMPTS }, OR: [{ status: 'PENDING', OR: [{ attempts: 0 }, { runAfter: { lte: now } }] }, { status: 'RUNNING', leaseUntil: { lt: now } }] },
    orderBy: { createdAt: 'asc' },
    take: limit,
  })
  const claimed: ClaimedJob[] = []
  for (const c of candidates) {
    const token = randomUUID()
    // Guarded on what was read, so of two claimers only one update matches.
    const result = await prisma.weeklyScoringJob.updateMany({
      where: { id: c.id, status: c.status, attempts: c.attempts, leaseToken: c.leaseToken },
      data: { status: 'RUNNING', attempts: { increment: 1 }, leaseToken: token, leaseUntil: new Date(now.getTime() + LEASE_MS), updatedAt: now },
    })
    if (result.count === 1) claimed.push({ id: c.id, responseId: c.responseId, revision: c.revision, attempts: c.attempts + 1, token })
  }
  return claimed
}

async function finish(job: ClaimedJob, now: Date, data: Prisma.WeeklyScoringJobUpdateManyMutationInput, outcome: Outcome): Promise<Outcome> {
  const result = await prisma.weeklyScoringJob.updateMany({ where: { id: job.id, leaseToken: job.token }, data: { ...data, leaseToken: null, leaseUntil: null, updatedAt: now } })
  return result.count === 1 ? outcome : 'LOST_LEASE'
}

function fail(job: ClaimedJob, now: Date, error: unknown): Promise<Outcome> {
  const code = error instanceof ModelError ? error.code : 'UNEXPECTED'
  if (!(error instanceof ModelError)) console.error('[weekly] scoring job failed unexpectedly', { jobId: job.id, error })
  const retryable = error instanceof ModelError ? error.retryable : true
  if (retryable && job.attempts < MAX_ATTEMPTS) {
    const delay = RETRY_DELAYS_MS[Math.min(job.attempts - 1, RETRY_DELAYS_MS.length - 1)]
    return finish(job, now, { status: 'PENDING', runAfter: new Date(now.getTime() + delay), error: code }, 'RETRY')
  }
  return finish(job, now, { status: 'FAILED', error: code }, 'FAILED')
}

/** What the model reads: the question, the scale, the choice, the note and earlier answers about the same person, without names. */
async function scoringInput(responseId: string) {
  const response = await prisma.weeklyResponse.findUnique({
    where: { id: responseId },
    include: { prompt: { include: { cycle: { select: { status: true } }, slot: { include: { competency: { select: { name: true, perspective: true } } } } } } },
  })
  if (!response) return null
  const prompt = response.prompt
  const people = await loadPeople([prompt.evaluatorId, prompt.evaluateeId])
  const names = { evaluatee: people.get(prompt.evaluateeId)?.name ?? '', evaluator: people.get(prompt.evaluatorId)?.name ?? '' }
  const clean = (text: string) => anonymise(text, names)
  const options = parseOptions(prompt.options)
  const chosen = options.find((o) => o.id === response.optionId)
  const earlier = await prisma.weeklyPrompt.findMany({
    where: { cycleId: prompt.cycleId, evaluatorId: prompt.evaluatorId, evaluateeId: prompt.evaluateeId, kind: 'STANDARD', status: 'SUBMITTED', id: { not: prompt.id } },
    include: { response: true, slot: { include: { competency: { select: { name: true } } } } },
    orderBy: { weekIndex: 'asc' },
  })
  const history = earlier.flatMap((p) => {
    const pick = parseOptions(p.options).find((o) => o.id === p.response?.optionId)
    return pick ? [{ week: p.weekIndex, topic: p.slot?.competency.name ?? '', question: clean(p.textSnapshot), chosen: clean(pick.text), level: pick.score, note: p.response?.note ? clean(p.response.note) : null }] : []
  })
  return {
    response, prompt, chosen,
    input: chosen && {
      perspective: perspectiveOf(prompt.relationshipType) ?? prompt.slot?.competency.perspective ?? 'PEER',
      topic: prompt.slot?.competency.name ?? '',
      question: clean(prompt.textSnapshot),
      scale: options.map((o) => ({ level: o.score, statement: clean(o.text) })),
      chosen: { level: chosen.score, statement: clean(chosen.text) },
      note: response.note ? clean(response.note) : null,
      history,
    },
  }
}

async function saveScore(job: ClaimedJob, model: string, output: ScoringOutput, usage: ModelResult, now: Date): Promise<Outcome> {
  return prisma.$transaction(async (tx): Promise<Outcome> => {
    await tx.$queryRaw`SELECT id FROM "WeeklyResponse" WHERE id = ${job.responseId} FOR UPDATE`
    const current = await tx.weeklyResponse.findUnique({ where: { id: job.responseId }, select: { revision: true } })
    const stale = current?.revision !== job.revision
    const owned = await tx.weeklyScoringJob.updateMany({
      where: { id: job.id, leaseToken: job.token, status: 'RUNNING' },
      data: { status: stale ? 'STALE' : 'DONE', error: null, leaseToken: null, leaseUntil: null, updatedAt: now },
    })
    if (owned.count === 0) throw new LostLease()
    if (stale) return 'STALE'
    const key = { responseId: job.responseId, revision: job.revision, model, promptVersion: PROMPT_VERSION }
    const existing = await tx.weeklyAiScore.findUnique({ where: { responseId_revision_model_promptVersion: key } })
    if (!existing) {
      await tx.weeklyAiScore.create({ data: { ...key, score: output.score, rationale: output.rationale, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, createdAt: now } })
    }
    return 'SCORED'
  })
}

async function scoreJob(job: ClaimedJob, model: StructuredModel | null, now: Date): Promise<Outcome> {
  try {
    const context = await scoringInput(job.responseId)
    if (!context || context.response.revision !== job.revision) return await finish(job, now, { status: 'STALE' }, 'STALE')
    if (context.prompt.kind !== 'STANDARD' || context.prompt.cycle.status !== 'RUNNING') return await finish(job, now, { status: 'CANCELLED' }, 'STALE')
    if (!context.input || !context.chosen) return await finish(job, now, { status: 'FAILED', error: 'NO_CHOICE' }, 'FAILED')
    if (!model) return await finish(job, now, { status: 'FAILED', error: 'NOT_CONFIGURED' }, 'FAILED')
    const usage = await model.complete({ ...buildScoringMessages(context.input), schemaName: SCORING_SCHEMA_NAME, schema: SCORING_JSON_SCHEMA })
    const parsed = scoringOutputSchema.safeParse(usage.value)
    if (!parsed.success) throw new ModelError('INVALID_OUTPUT')
    return await saveScore(job, model.name, finalizeScore(parsed.data, context.chosen.score), usage, now)
  } catch (error) {
    if (error instanceof LostLease) return 'LOST_LEASE'
    return fail(job, now, error)
  }
}

export async function runScoring(input: { model: StructuredModel | null; budgetMs: number; clock?: () => Date; responseIds?: readonly string[]; limit?: number; concurrency?: number }): Promise<ScoringRunSummary> {
  const clock = input.clock ?? (() => new Date())
  const started = Date.now()
  const limit = input.limit ?? 200
  const concurrency = Math.max(1, input.concurrency ?? 4)
  let scored = 0
  let failed = 0
  let attempted = 0
  while (attempted < limit && Date.now() - started < input.budgetMs) {
    const batch = await claimJobs(clock(), Math.min(concurrency, limit - attempted), input.responseIds)
    if (batch.length === 0) break
    const outcomes = await Promise.all(batch.map((job) => scoreJob(job, input.model, clock())))
    scored += outcomes.filter((o) => o === 'SCORED').length
    failed += outcomes.filter((o) => o === 'FAILED').length
    attempted += batch.length
  }
  const remaining = await prisma.weeklyScoringJob.count({ where: { ...scopeOf(input.responseIds), status: { in: ['PENDING', 'RUNNING'] } } })
  return { scored, failed, remaining }
}

/** Runs after the response is sent (Next.js `after`): scores one answer now with the active model. Never throws. */
export async function scorePromptSoon(promptId: string, model?: StructuredModel | null): Promise<void> {
  try {
    const response = await prisma.weeklyResponse.findUnique({ where: { promptId }, select: { id: true, prompt: { select: { kind: true } } } })
    if (!response || response.prompt.kind !== 'STANDARD') return
    const chosen = model !== undefined ? model : await resolveActiveModel()
    await runScoring({ model: chosen, budgetMs: INLINE_BUDGET_MS, responseIds: [response.id], limit: MAX_ATTEMPTS, concurrency: 1 })
  } catch (error) {
    console.error('[weekly] scoring after submit failed', { promptId, error })
  }
}
