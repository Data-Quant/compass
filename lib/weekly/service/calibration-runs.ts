// Part D §3: calibration runs. A SET run scores the calibration set; a CYCLE run re-scores a quarter's decided answers for
// comparison. Both use live scoring's call (scoreOnce) and never write WeeklyAiScore or reviews (D11).
import type { Prisma, WeeklyCalibrationResult, WeeklyCalibrationRun } from '@prisma/client'
import { prisma } from '@/lib/db'
import { calibrationModelFor } from '../ai/configured'
import { MODEL_TIMEOUT_MS } from '../ai/fireworks'
import { FAKE_MODEL_NAME, ModelError, type StructuredModel } from '../ai/model'
import { scoreOnce, type ScoredOnce } from '../ai/score-once'
import { SCORING_PROMPT_VERSION, type ScoreFlag, type ScoringInput } from '../ai/scoring-prompt'
import { isValidModelId, summarizeCalibration, type CalibrationRow } from '../calibration-rules'
import { areWeeklyTestToolsEnabled } from '../flag'
import { perspectiveOf } from '../perspectives'
import { parseProfileLevels } from '../profile'
import { isConfirmedAction } from '../reviews'
import type { CalibrationRunInput } from '../schemas'
import { looksSensitive } from '../sensitive'
import type { CalibrationProgressView } from '../view-types'
import { loadAiSettings } from './ai-settings'
import { redactorFor } from './anonymise'
import { loadAnswerRecords } from './answer-states'
import { recordAudit } from './audit'
import { assertHr, type WeeklyActor } from './context'
import { loadCycle } from './cycles'
import { toJson } from './db'
import { WeeklyError } from './errors'

export const CALIBRATION_BUDGET_MS = 50_000
export const CALIBRATION_DAILY_BUDGET_MS = 45_000
export const CALIBRATION_CONCURRENCY = 4
/** Room for database work after the last call; the lease also covers a call and its retry after the budget. */
export const CALIBRATION_LEASE_MARGIN_MS = 10_000
export const INVALID_RUN_MODEL = 'Use a Fireworks model id such as accounts/fireworks/models/llama-v3p1-70b-instruct (the stand-in only on the preview)'
export const MODEL_UNAVAILABLE = 'The model is not available: FIREWORKS_API_KEY is not set, or the stand-in was used outside the preview'

export type ModelResolver = (modelId: string) => StructuredModel | null
export interface AdvanceOptions { resolveModel?: ModelResolver; clock?: () => Date }
export type CalibrationProgress = CalibrationProgressView

type Target = Pick<WeeklyCalibrationResult, 'itemId' | 'responseId' | 'competencyId' | 'targetSufficiency' | 'targetScore'>
  & Partial<Pick<WeeklyCalibrationResult, 'question' | 'situation' | 'action' | 'result' | 'shortfall'>>
interface Prepared { input: ScoringInput; systemFlags: ScoreFlag[]; profileId: string }
type Outcome = Prisma.WeeklyCalibrationResultUpdateManyMutationInput

/** Every active item, HR's judgement as the target. Targets and text are copied into the run, so later edits do not change it. */
async function setTargets(): Promise<Target[]> {
  const items = await prisma.weeklyCalibrationItem.findMany({ where: { archivedAt: null }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
  return items.map((i) => ({
    itemId: i.id, responseId: null, competencyId: i.competencyId, targetSufficiency: i.hrSufficiency, targetScore: i.hrScore,
    question: i.question, situation: i.situation, action: i.action, result: i.result, shortfall: i.shortfall,
  }))
}

/** Spec 8.6: the quarter's decided answers, the final decision as the target. Excluded answers are skipped. */
async function cycleTargets(cycleId: string): Promise<Target[]> {
  await loadCycle(cycleId)
  return (await loadAnswerRecords({ cycleId })).flatMap((r): Target[] => {
    const review = r.latestReview
    if (r.state !== 'DECIDED' || !review || !r.competencyId) return []
    const base = { itemId: null, responseId: r.responseId, competencyId: r.competencyId }
    if (isConfirmedAction(review.action) && review.finalScore !== null) return [{ ...base, targetSufficiency: 'SUFFICIENT', targetScore: review.finalScore }]
    if (review.action === 'MARKED_INSUFFICIENT') return [{ ...base, targetSufficiency: 'INSUFFICIENT', targetScore: null }]
    return []
  })
}

export async function startCalibrationRun(actor: WeeklyActor, input: CalibrationRunInput, now: Date): Promise<{ runId: string; itemCount: number }> {
  assertHr(actor)
  const model = input.model.trim()
  if (!isValidModelId(model) && !(model === FAKE_MODEL_NAME && areWeeklyTestToolsEnabled())) throw new WeeklyError(INVALID_RUN_MODEL)
  const targets = input.kind === 'SET' ? await setTargets() : await cycleTargets(input.cycleId)
  if (targets.length === 0) throw new WeeklyError(input.kind === 'SET' ? 'Add calibration items first' : 'This quarter has no decided answers to compare', 409)
  return prisma.$transaction(async (tx) => {
    const run = await tx.weeklyCalibrationRun.create({
      data: {
        kind: input.kind, cycleId: input.kind === 'CYCLE' ? input.cycleId : null, model, promptVersion: SCORING_PROMPT_VERSION,
        itemCount: targets.length, startedById: actor.id, createdAt: now,
      },
    })
    await tx.weeklyCalibrationResult.createMany({ data: targets.map((t) => ({ ...t, runId: run.id, createdAt: now })) })
    await recordAudit(tx, {
      cycleId: run.cycleId, actorId: actor.id, actorRole: 'HR', action: 'CALIBRATION_RUN_START', objectType: 'WeeklyCalibrationRun', objectId: run.id,
      after: { kind: run.kind, model, itemCount: targets.length },
    })
    return { runId: run.id, itemCount: targets.length }
  })
}

const fullText = (a: { situation: string; action: string; result: string; shortfall?: string | null }) =>
  [a.situation, a.action, a.result, a.shortfall ?? ''].filter(Boolean).join('\n')
const sensitiveFlag = (text: string): ScoreFlag[] => (looksSensitive(text) ? ['SENSITIVE_CONTENT'] : [])

/** The topic's currently approved profile, as live scoring uses it. */
async function approvedProfile(competencyId: string) {
  const competency = await prisma.weeklyCompetency.findUnique({
    where: { id: competencyId },
    include: { profiles: { where: { status: 'APPROVED' }, orderBy: { version: 'desc' }, take: 1 } },
  })
  const profile = competency?.profiles[0]
  const levels = profile ? parseProfileLevels(profile.levels) : null
  return competency && profile && levels ? { competency, profile, levels } : null
}

/** A calibration item is stored anonymised; the run scores the copy it took at the start. */
async function itemInput(item: WeeklyCalibrationResult): Promise<Prepared | string> {
  if (item.question === null || item.situation === null || item.action === null || item.result === null) return 'ITEM_MISSING'
  const approved = await approvedProfile(item.competencyId)
  if (!approved) return 'NO_APPROVED_PROFILE'
  const answer = { situation: item.situation, action: item.action, result: item.result, shortfall: item.shortfall ?? '' }
  return {
    profileId: approved.profile.id,
    systemFlags: sensitiveFlag(fullText(answer)),
    input: {
      topic: { name: approved.competency.name, definition: approved.competency.definition }, perspective: approved.competency.perspective,
      profile: { levels: approved.levels, insufficientDefinition: approved.profile.insufficientDefinition },
      question: item.question, answer, evaluatee: { position: null, department: null },
    },
  }
}

/** A real answer: names are removed now, exactly as live scoring removes them. */
async function responseInput(responseId: string, competencyId: string): Promise<Prepared | string> {
  const [response, approved] = await Promise.all([
    prisma.weeklyResponse.findUnique({ where: { id: responseId }, include: { prompt: true } }), approvedProfile(competencyId),
  ])
  if (!response) return 'ANSWER_MISSING'
  if (!approved) return 'NO_APPROVED_PROFILE'
  const { redact, evaluatee } = await redactorFor(response.prompt.evaluatorId, response.prompt.evaluateeId)
  const answer = { situation: redact(response.situation), action: redact(response.action), result: redact(response.result), shortfall: redact(response.shortfall ?? '') }
  return {
    profileId: approved.profile.id,
    systemFlags: sensitiveFlag(fullText(response)),
    input: {
      topic: { name: approved.competency.name, definition: approved.competency.definition },
      perspective: perspectiveOf(response.prompt.relationshipType) ?? approved.competency.perspective,
      profile: { levels: approved.levels, insufficientDefinition: approved.profile.insufficientDefinition },
      question: redact(response.prompt.textSnapshot), answer,
      evaluatee: { position: evaluatee?.position ?? null, department: evaluatee?.department ?? null },
    },
  }
}

/** A model error is retried once while the budget lasts; the second failure is the item's error. */
async function withOneRetry(attempt: () => Promise<ScoredOnce>, canRetry: () => boolean): Promise<ScoredOnce> {
  try {
    return await attempt()
  } catch (error) {
    if (error instanceof ModelError && error.retryable && canRetry()) return attempt()
    throw error
  }
}

async function outcomeFor(result: WeeklyCalibrationResult, model: StructuredModel, canRetry: () => boolean): Promise<Outcome> {
  const prepared = result.itemId
    ? await itemInput(result)
    : result.responseId ? await responseInput(result.responseId, result.competencyId) : 'NOTHING_TO_SCORE'
  if (typeof prepared === 'string') return { error: prepared }
  try {
    const { final, usage, latencyMs } = await withOneRetry(() => scoreOnce(model, prepared.input, prepared.systemFlags), canRetry)
    return {
      sufficiency: final.sufficiency, score: final.score, confidence: final.confidence, rationale: final.rationale,
      flags: toJson(final.flags), evidenceQuotes: toJson(final.evidenceQuotes), profileId: prepared.profileId,
      inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, latencyMs, error: null,
    }
  } catch (error) {
    if (!(error instanceof ModelError)) console.error('[weekly] calibration item failed unexpectedly', { resultId: result.id, error })
    return { error: error instanceof ModelError ? error.code : 'UNEXPECTED', profileId: prepared.profileId }
  }
}

export async function topicNames(competencyIds: readonly string[]): Promise<Map<string, string>> {
  const topics = await prisma.weeklyCompetency.findMany({ where: { id: { in: [...new Set(competencyIds)] } }, select: { id: true, name: true } })
  return new Map(topics.map((t) => [t.id, t.name]))
}

export function calibrationRows(results: readonly WeeklyCalibrationResult[], topics: ReadonlyMap<string, string>): CalibrationRow[] {
  return results.map((r) => ({
    topic: topics.get(r.competencyId) ?? 'Unknown topic',
    target: { sufficiency: r.targetSufficiency, score: r.targetScore },
    ai: { sufficiency: r.sufficiency, score: r.score },
    error: r.error, inputTokens: r.inputTokens, outputTokens: r.outputTokens, latencyMs: r.latencyMs,
  }))
}

/** Stores the summary and ends the run: DONE when every item has a result, FAILED with `failure` otherwise. */
async function finish(run: WeeklyCalibrationRun, now: Date, failure: string | null): Promise<void> {
  const results = await prisma.weeklyCalibrationResult.findMany({ where: { runId: run.id, completedAt: { not: null } } })
  const topics = await topicNames(results.map((r) => r.competencyId))
  const summary = summarizeCalibration(calibrationRows(results, topics), (await loadAiSettings()).prices[run.model], failure)
  await prisma.weeklyCalibrationRun.updateMany({
    where: { id: run.id, status: 'RUNNING' },
    data: { status: failure ? 'FAILED' : 'DONE', finishedAt: now, summary: toJson(summary), leaseUntil: null },
  })
}

async function progressOf(runId: string): Promise<CalibrationProgress> {
  const run = await prisma.weeklyCalibrationRun.findUnique({ where: { id: runId }, select: { status: true, itemCount: true } })
  if (!run) throw new WeeklyError('Calibration run not found', 404)
  const completed = await prisma.weeklyCalibrationResult.count({ where: { runId, completedAt: { not: null } } })
  return { runId, status: run.status as CalibrationProgress['status'], completed, itemCount: run.itemCount, busy: false }
}

/**
 * Scores the run's pending items, CALIBRATION_CONCURRENCY at a time, until none are left or the budget is spent.
 * One worker at a time: the lease is taken with a guarded update, so the after() started with the run, HR's "Continue"
 * and the daily job never score the same item twice. The lease outlasts the budget by a call and its retry, and a worker
 * releases only its own lease, so a late worker never frees one another worker holds.
 */
export async function advanceCalibrationRun(runId: string, budgetMs: number, options: AdvanceOptions = {}): Promise<CalibrationProgress> {
  const clock = options.clock ?? (() => new Date())
  const started = Date.now()
  const now = clock()
  const leaseUntil = new Date(now.getTime() + budgetMs + 2 * MODEL_TIMEOUT_MS + CALIBRATION_LEASE_MARGIN_MS)
  const canRetry = () => Date.now() - started < budgetMs
  const claimed = await prisma.weeklyCalibrationRun.updateMany({
    where: { id: runId, status: 'RUNNING', OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
    data: { leaseUntil },
  })
  if (claimed.count === 0) {
    const progress = await progressOf(runId)
    return { ...progress, busy: progress.status === 'RUNNING' }
  }
  try {
    const run = await prisma.weeklyCalibrationRun.findUniqueOrThrow({ where: { id: runId } })
    const model = (options.resolveModel ?? ((id: string) => calibrationModelFor(id)))(run.model)
    if (!model) {
      await finish(run, clock(), MODEL_UNAVAILABLE)
      return await progressOf(runId)
    }
    while (Date.now() - started < budgetMs) {
      const pending = await prisma.weeklyCalibrationResult.findMany({ where: { runId, completedAt: null }, orderBy: { id: 'asc' }, take: CALIBRATION_CONCURRENCY })
      if (pending.length === 0) break
      await Promise.all(pending.map(async (result) => {
        const outcome = await outcomeFor(result, model, canRetry)
        await prisma.weeklyCalibrationResult.updateMany({ where: { id: result.id, completedAt: null }, data: { ...outcome, completedAt: clock() } })
      }))
    }
    if ((await prisma.weeklyCalibrationResult.count({ where: { runId, completedAt: null } })) === 0) await finish(run, clock(), null)
    return await progressOf(runId)
  } finally {
    await prisma.weeklyCalibrationRun.updateMany({ where: { id: runId, status: 'RUNNING', leaseUntil }, data: { leaseUntil: null } })
  }
}

/** HR's "Continue". */
export async function continueCalibrationRun(actor: WeeklyActor, runId: string, options: AdvanceOptions = {}): Promise<CalibrationProgress> {
  assertHr(actor)
  return advanceCalibrationRun(runId, CALIBRATION_BUDGET_MS, options)
}

/** The daily job continues every running run, oldest first, within its budget. One broken run never stops the job. */
export async function continueCalibrationRuns(budgetMs: number, options: AdvanceOptions = {}): Promise<CalibrationProgress[]> {
  const started = Date.now()
  const running = await prisma.weeklyCalibrationRun.findMany({ where: { status: 'RUNNING' }, orderBy: { createdAt: 'asc' }, select: { id: true } })
  const progress: CalibrationProgress[] = []
  for (const run of running) {
    const left = budgetMs - (Date.now() - started)
    if (left <= 0) break
    try {
      progress.push(await advanceCalibrationRun(run.id, left, options))
    } catch (error) {
      console.error('[weekly] calibration run could not continue', { runId: run.id, error })
    }
  }
  return progress
}

/** Runs after the response (Next.js `after`) when HR starts a run. Never throws. */
export async function advanceCalibrationRunSoon(runId: string): Promise<void> {
  try {
    await advanceCalibrationRun(runId, CALIBRATION_BUDGET_MS)
  } catch (error) {
    console.error('[weekly] calibration run failed', { runId, error })
  }
}
