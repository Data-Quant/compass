// D10: whether scores from a model may be auto-accepted, decided by its latest calibration-set run on the current prompt.
import { prisma } from '@/lib/db'
import { FAKE_MODEL_NAME } from '../ai/model'
import { SCORING_PROMPT_VERSION } from '../ai/scoring-prompt'
import { gateResult, parseSummary, type GateResult } from '../calibration-rules'
import type { ModelGateView } from '../view-types'
import type { Db } from './db'

export interface LatestRun { id: string; model: string; finishedAt: Date | null; gate: GateResult }

/** Each model's latest DONE calibration-set run on the current SCORING_PROMPT_VERSION. */
export async function latestSetRuns(db: Db = prisma): Promise<Map<string, LatestRun>> {
  const runs = await db.weeklyCalibrationRun.findMany({
    where: { kind: 'SET', status: 'DONE', promptVersion: SCORING_PROMPT_VERSION },
    orderBy: [{ finishedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true, model: true, finishedAt: true, summary: true },
  })
  const latest = new Map<string, LatestRun>()
  for (const run of runs) {
    if (latest.has(run.model)) continue
    const summary = parseSummary(run.summary)
    latest.set(run.model, { id: run.id, model: run.model, finishedAt: run.finishedAt, gate: summary ? gateResult(summary) : { passed: false, reasons: ['The run’s summary could not be read'] } })
  }
  return latest
}

/** The models whose scores may be auto-accepted. The stand-in, a preview test double, is always trusted. */
export async function trustedModelNames(db: Db = prisma): Promise<Set<string>> {
  const trusted = [...(await latestSetRuns(db)).values()].filter((run) => run.gate.passed).map((run) => run.model)
  return new Set([FAKE_MODEL_NAME, ...trusted])
}

export function gateView(model: string, latest: ReadonlyMap<string, LatestRun>): ModelGateView {
  if (model === FAKE_MODEL_NAME) return { model, trusted: true, standIn: true, runId: null, finishedAt: null, reasons: [] }
  const run = latest.get(model)
  if (!run) return { model, trusted: false, standIn: false, runId: null, finishedAt: null, reasons: ['No completed calibration-set run on the current scoring prompt'] }
  return { model, trusted: run.gate.passed, standIn: false, runId: run.id, finishedAt: run.finishedAt?.toISOString() ?? null, reasons: run.gate.reasons }
}

export async function modelGate(model: string, db: Db = prisma): Promise<ModelGateView> {
  return gateView(model, await latestSetRuns(db))
}
