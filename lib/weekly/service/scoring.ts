import { randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { ModelError, type ModelResult, type StructuredModel } from '../ai/model'
import { scoreOnce } from '../ai/score-once'
import { SCORING_PROMPT_VERSION, type FinalScore, type ScoreFlag } from '../ai/scoring-prompt'
import { perspectiveOf } from '../perspectives'
import { parseProfileLevels } from '../profile'
import { looksSensitive } from '../sensitive'
import { isNearDuplicate } from '../similarity'
import { resolveActiveModel } from './ai-settings'
import { redactorFor } from './anonymise'
import { lockResponse, toJson } from './db'

export const MAX_ATTEMPTS = 3
export const LEASE_MS = 2 * 60 * 1000
export const RETRY_DELAYS_MS: readonly number[] = [5_000, 20_000]
export const INLINE_BUDGET_MS = 120_000

export interface ClaimedJob { id: string; responseId: string; revision: number; attempts: number; token: string }
export type JobOutcome = 'SCORED' | 'INSUFFICIENT' | 'RETRY' | 'FAILED' | 'STALE' | 'LOST_LEASE'
export interface ScoringRunSummary { scored: number; insufficient: number; retried: number; failed: number; stale: number; remaining: number }

class LostLease extends Error {}

type Texts = { situation: string; action: string; result: string; shortfall?: string | null }
const coreText = (r: Texts) => [r.situation, r.action, r.result].join('\n')
const fullText = (r: Texts) => [r.situation, r.action, r.result, r.shortfall ?? ''].filter(Boolean).join('\n')
const scopeOf = (responseIds?: readonly string[]): Prisma.WeeklyScoringJobWhereInput => (responseIds ? { responseId: { in: [...responseIds] } } : {})

export async function claimJobs(input: { now: Date; limit: number; responseIds?: readonly string[] }): Promise<ClaimedJob[]> {
  const { now } = input
  const scope = scopeOf(input.responseIds)
  // A worker that died holding the last attempt's lease will never finish: fail it into HR's manual queue.
  await prisma.weeklyScoringJob.updateMany({
    where: { ...scope, status: 'RUNNING', leaseUntil: { lt: now }, attempts: { gte: MAX_ATTEMPTS } },
    data: { status: 'FAILED', error: 'LEASE_EXPIRED', leaseToken: null, leaseUntil: null, updatedAt: now },
  })
  const candidates = await prisma.weeklyScoringJob.findMany({
    where: {
      ...scope,
      attempts: { lt: MAX_ATTEMPTS },
      OR: [{ status: 'PENDING', OR: [{ attempts: 0 }, { runAfter: { lte: now } }] }, { status: 'RUNNING', leaseUntil: { lt: now } }],
    },
    orderBy: { createdAt: 'asc' },
    take: input.limit,
  })
  const claimed: ClaimedJob[] = []
  for (const candidate of candidates) {
    const token = randomUUID()
    // Guarded on what was read: a concurrent claimer changes attempts and the token first, so only one update matches.
    const result = await prisma.weeklyScoringJob.updateMany({
      where: { id: candidate.id, status: candidate.status, attempts: candidate.attempts, leaseToken: candidate.leaseToken },
      data: { status: 'RUNNING', attempts: { increment: 1 }, leaseToken: token, leaseUntil: new Date(now.getTime() + LEASE_MS), updatedAt: now },
    })
    if (result.count === 1) claimed.push({ id: candidate.id, responseId: candidate.responseId, revision: candidate.revision, attempts: candidate.attempts + 1, token })
  }
  return claimed
}

async function finish(job: ClaimedJob, now: Date, data: Prisma.WeeklyScoringJobUpdateManyMutationInput, outcome: JobOutcome): Promise<JobOutcome> {
  const result = await prisma.weeklyScoringJob.updateMany({
    where: { id: job.id, leaseToken: job.token },
    data: { ...data, leaseToken: null, leaseUntil: null, updatedAt: now },
  })
  return result.count === 1 ? outcome : 'LOST_LEASE'
}

function fail(job: ClaimedJob, now: Date, error: unknown): Promise<JobOutcome> {
  const code = error instanceof ModelError ? error.code : 'UNEXPECTED'
  if (!(error instanceof ModelError)) console.error('[weekly] scoring job failed unexpectedly', { jobId: job.id, error })
  const retryable = error instanceof ModelError ? error.retryable : true
  if (retryable && job.attempts < MAX_ATTEMPTS) {
    const delay = RETRY_DELAYS_MS[Math.min(job.attempts - 1, RETRY_DELAYS_MS.length - 1)]
    return finish(job, now, { status: 'PENDING', runAfter: new Date(now.getTime() + delay), error: code }, 'RETRY')
  }
  return finish(job, now, { status: 'FAILED', error: code }, 'FAILED')
}

function loadJobContext(responseId: string) {
  return prisma.weeklyResponse.findUnique({
    where: { id: responseId },
    include: {
      prompt: {
        include: {
          cycle: { select: { status: true } },
          slot: { include: { competency: { include: { profiles: { where: { status: 'APPROVED' }, orderBy: { version: 'desc' }, take: 1 } } } } },
        },
      },
    },
  })
}

async function otherAnswers(cycleId: string, evaluatorId: string, responseId: string): Promise<string[]> {
  const rows = await prisma.weeklyResponse.findMany({
    where: { id: { not: responseId }, submittedAt: { not: null }, prompt: { cycleId, evaluatorId, kind: { not: 'COMMENT' } } },
    select: { situation: true, action: true, result: true },
  })
  return rows.map(coreText)
}

interface ScoreToSave { responseId: string; promptId: string; profileId: string; model: string; final: FinalScore; usage: ModelResult }

function saveScore(job: ClaimedJob, input: ScoreToSave, now: Date): Promise<JobOutcome> {
  return prisma.$transaction(async (tx): Promise<JobOutcome> => {
    await lockResponse(tx, input.responseId)
    const current = await tx.weeklyResponse.findUnique({ where: { id: input.responseId }, select: { revision: true } })
    const stale = current?.revision !== job.revision
    const owned = await tx.weeklyScoringJob.updateMany({
      where: { id: job.id, leaseToken: job.token, status: 'RUNNING' },
      data: { status: stale ? 'STALE' : 'DONE', error: null, leaseToken: null, leaseUntil: null, updatedAt: now },
    })
    if (owned.count === 0) throw new LostLease()
    if (stale) return 'STALE'
    const key = { responseId: input.responseId, revision: job.revision, profileId: input.profileId, model: input.model, promptVersion: SCORING_PROMPT_VERSION }
    // Checked under the row lock instead of catching a unique violation, which would abort the transaction.
    const existing = await tx.weeklyAiScore.findUnique({ where: { responseId_revision_profileId_model_promptVersion: key } })
    const { final } = input
    if (!existing) {
      await tx.weeklyAiScore.create({
        data: {
          ...key, sufficiency: final.sufficiency, score: final.score, confidence: final.confidence,
          criteriaMet: toJson(final.criteriaMet), criteriaNotDemonstrated: toJson(final.criteriaNotDemonstrated), evidenceQuotes: toJson(final.evidenceQuotes),
          rationale: final.rationale, flags: toJson(final.flags),
          inputTokens: input.usage.inputTokens, outputTokens: input.usage.outputTokens, createdAt: now,
        },
      })
    }
    return final.sufficiency === 'SUFFICIENT' ? 'SCORED' : 'INSUFFICIENT'
  })
}

export async function scoreClaimedJob(job: ClaimedJob, model: StructuredModel | null, now: Date): Promise<JobOutcome> {
  try {
    const response = await loadJobContext(job.responseId)
    const prompt = response?.prompt
    if (!response || !prompt || response.revision !== job.revision) return await finish(job, now, { status: 'STALE' }, 'STALE')
    const competency = prompt.slot?.competency
    if (prompt.kind === 'COMMENT' || !competency || prompt.cycle.status !== 'RUNNING') return await finish(job, now, { status: 'CANCELLED' }, 'STALE')
    const profile = competency.profiles[0]
    const levels = profile ? parseProfileLevels(profile.levels) : null
    if (!profile || !levels) return await finish(job, now, { status: 'FAILED', error: 'NO_APPROVED_PROFILE' }, 'FAILED')
    if (!model) return await finish(job, now, { status: 'FAILED', error: 'NOT_CONFIGURED' }, 'FAILED')
    const { redact, evaluatee } = await redactorFor(prompt.evaluatorId, prompt.evaluateeId)
    const answer = { situation: redact(response.situation), action: redact(response.action), result: redact(response.result), shortfall: redact(response.shortfall ?? '') }
    const others = await otherAnswers(prompt.cycleId, prompt.evaluatorId, response.id)
    const systemFlags: ScoreFlag[] = [
      ...(others.some((other) => isNearDuplicate(coreText(response), other)) ? (['POSSIBLE_COPY'] as const) : []),
      ...(looksSensitive(fullText(response)) ? (['SENSITIVE_CONTENT'] as const) : []),
    ]
    const { final, usage } = await scoreOnce(model, {
      topic: { name: competency.name, definition: competency.definition },
      perspective: perspectiveOf(prompt.relationshipType) ?? competency.perspective,
      profile: { levels, insufficientDefinition: profile.insufficientDefinition },
      question: redact(prompt.textSnapshot),
      answer,
      evaluatee: { position: evaluatee?.position ?? null, department: evaluatee?.department ?? null },
    }, systemFlags)
    return await saveScore(job, { responseId: response.id, promptId: prompt.id, profileId: profile.id, model: model.name, final, usage }, now)
  } catch (error) {
    if (error instanceof LostLease) return 'LOST_LEASE'
    return fail(job, now, error)
  }
}

async function nextRetryWait(now: Date, responseIds?: readonly string[]): Promise<number | null> {
  const next = await prisma.weeklyScoringJob.findFirst({
    where: { ...scopeOf(responseIds), status: 'PENDING', attempts: { gt: 0, lt: MAX_ATTEMPTS } },
    orderBy: { runAfter: 'asc' },
    select: { runAfter: true },
  })
  return next ? Math.max(0, next.runAfter.getTime() - now.getTime()) : null
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function runScoring(input: {
  model: StructuredModel | null
  budgetMs: number
  clock?: () => Date
  responseIds?: readonly string[]
  limit?: number
  concurrency?: number
  /** Real-time callers only: sleep until a retry is due instead of leaving it for the next sweep. */
  waitForRetries?: boolean
}): Promise<ScoringRunSummary> {
  const clock = input.clock ?? (() => new Date())
  const started = Date.now()
  const limit = input.limit ?? 200
  const concurrency = Math.max(1, input.concurrency ?? 4)
  const counts = { scored: 0, insufficient: 0, retried: 0, failed: 0, stale: 0 }
  let attempted = 0
  while (attempted < limit && Date.now() - started < input.budgetMs) {
    const batch = await claimJobs({ now: clock(), limit: Math.min(concurrency, limit - attempted), responseIds: input.responseIds })
    if (batch.length === 0) {
      const wait = input.waitForRetries ? await nextRetryWait(clock(), input.responseIds) : null
      if (wait === null || Date.now() - started + wait >= input.budgetMs) break
      await sleep(wait)
      continue
    }
    const outcomes = await Promise.all(batch.map((job) => scoreClaimedJob(job, input.model, clock())))
    for (const outcome of outcomes) {
      if (outcome === 'SCORED') counts.scored += 1
      else if (outcome === 'INSUFFICIENT') counts.insufficient += 1
      else if (outcome === 'RETRY') counts.retried += 1
      else if (outcome === 'FAILED') counts.failed += 1
      else if (outcome === 'STALE') counts.stale += 1
    }
    attempted += batch.length
  }
  const remaining = await prisma.weeklyScoringJob.count({ where: { ...scopeOf(input.responseIds), status: { in: ['PENDING', 'RUNNING'] } } })
  return { ...counts, remaining }
}

/** Runs after the response has been sent (Next.js `after`): scores one answer now with the active model, retrying briefly. Never throws. */
export async function scoreResponseSoon(responseId: string, model?: StructuredModel | null): Promise<void> {
  try {
    const chosen = model !== undefined ? model : await resolveActiveModel()
    await runScoring({ model: chosen, budgetMs: INLINE_BUDGET_MS, responseIds: [responseId], limit: MAX_ATTEMPTS, concurrency: 1, waitForRetries: true })
  } catch (error) {
    console.error('[weekly] scoring after submit failed', { responseId, error })
  }
}

export async function scorePromptSoon(promptId: string): Promise<void> {
  try {
    const response = await prisma.weeklyResponse.findUnique({ where: { promptId }, select: { id: true, prompt: { select: { kind: true } } } })
    if (response && response.prompt.kind !== 'COMMENT') await scoreResponseSoon(response.id)
  } catch (error) {
    console.error('[weekly] scoring after submit failed', { promptId, error })
  }
}
