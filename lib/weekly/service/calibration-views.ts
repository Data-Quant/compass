import type { WeeklyCalibrationResult, WeeklyCalibrationRun } from '@prisma/client'
import { prisma } from '@/lib/db'
import { agreement, costUsd, gateResult, parseSummary, summarizeCalibration, type ModelPrices } from '../calibration-rules'
import type { CalibrationResultView, CalibrationRunDetailResponse, CalibrationRunRow, CalibrationRunsResponse, SufficiencyValue } from '../view-types'
import { loadAiSettings } from './ai-settings'
import { calibrationRows, topicNames } from './calibration-runs'
import { assertHr, loadPeople, type WeeklyActor } from './context'
import { WeeklyError } from './errors'

const RUN_LIST_LIMIT = 50
const asSufficiency = (value: string | null): SufficiencyValue => (value === 'INSUFFICIENT' ? 'INSUFFICIENT' : 'SUFFICIENT')

async function runRows(runs: readonly WeeklyCalibrationRun[], prices: ModelPrices): Promise<CalibrationRunRow[]> {
  if (runs.length === 0) return []
  const [completed, people, cycles] = await Promise.all([
    prisma.weeklyCalibrationResult.groupBy({ by: ['runId'], where: { runId: { in: runs.map((r) => r.id) }, completedAt: { not: null } }, _count: { _all: true } }),
    loadPeople(runs.map((r) => r.startedById)),
    prisma.weeklyCycle.findMany({ where: { id: { in: runs.flatMap((r) => (r.cycleId ? [r.cycleId] : [])) } }, select: { id: true, periodId: true } }),
  ])
  const periods = new Map((await prisma.evaluationPeriod.findMany({ where: { id: { in: cycles.map((c) => c.periodId) } }, select: { id: true, name: true } })).map((p) => [p.id, p.name]))
  const cycleNames = new Map(cycles.map((c) => [c.id, periods.get(c.periodId) ?? null]))
  const done = new Map(completed.map((c) => [c.runId, c._count._all]))
  return runs.map((run): CalibrationRunRow => {
    const summary = parseSummary(run.summary)
    return {
      id: run.id, kind: run.kind === 'CYCLE' ? 'CYCLE' : 'SET', cycleId: run.cycleId, cycleName: run.cycleId ? cycleNames.get(run.cycleId) ?? null : null,
      model: run.model, promptVersion: run.promptVersion, status: run.status as CalibrationRunRow['status'], itemCount: run.itemCount,
      completed: done.get(run.id) ?? 0, startedBy: people.get(run.startedById)?.name ?? 'Unknown', createdAt: run.createdAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null, summary,
      // The cost stored at the end of the run; a price set later still fills a missing one.
      costUsd: summary ? summary.costUsd ?? costUsd(summary, prices[run.model]) : null,
      gate: run.kind === 'SET' && run.status === 'DONE' && summary ? gateResult(summary) : null,
    }
  })
}

export async function calibrationRunsView(actor: WeeklyActor): Promise<CalibrationRunsResponse> {
  assertHr(actor)
  const runs = await prisma.weeklyCalibrationRun.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: RUN_LIST_LIMIT })
  return { runs: await runRows(runs, (await loadAiSettings()).prices) }
}

/** An item's situation, or who an answer was about, to tell results apart. */
async function resultLabels(results: readonly WeeklyCalibrationResult[]): Promise<Map<string, string>> {
  const items = await prisma.weeklyCalibrationItem.findMany({ where: { id: { in: results.flatMap((r) => (r.itemId ? [r.itemId] : [])) } }, select: { id: true, situation: true } })
  const responses = await prisma.weeklyResponse.findMany({
    where: { id: { in: results.flatMap((r) => (r.responseId ? [r.responseId] : [])) } },
    select: { id: true, prompt: { select: { evaluatorId: true, evaluateeId: true, weekIndex: true } } },
  })
  const people = await loadPeople(responses.flatMap((r) => [r.prompt.evaluatorId, r.prompt.evaluateeId]))
  const clip = (text: string) => (text.length > 90 ? `${text.slice(0, 87)}…` : text)
  return new Map([
    ...items.map((i) => [i.id, clip(i.situation)] as const),
    ...responses.map((r) => [r.id, `${people.get(r.prompt.evaluateeId)?.name ?? 'Someone'} · from ${people.get(r.prompt.evaluatorId)?.name ?? 'someone'} · week ${r.prompt.weekIndex}`] as const),
  ])
}

function resultView(r: WeeklyCalibrationResult, topics: ReadonlyMap<string, string>, labels: ReadonlyMap<string, string>): CalibrationResultView {
  const scored = r.completedAt !== null && r.error === null
  const match = scored ? agreement({ sufficiency: r.targetSufficiency, score: r.targetScore }, { sufficiency: r.sufficiency, score: r.score }) : null
  return {
    id: r.id, label: labels.get(r.itemId ?? r.responseId ?? '') ?? '—', topic: topics.get(r.competencyId) ?? 'Unknown topic',
    target: { sufficiency: asSufficiency(r.targetSufficiency), score: r.targetScore },
    ai: scored ? { sufficiency: asSufficiency(r.sufficiency), score: r.score, confidence: r.confidence, rationale: r.rationale } : null,
    exact: match?.exact ?? null, withinOne: match?.withinOne ?? null, error: r.error, latencyMs: r.latencyMs, completed: r.completedAt !== null,
  }
}

export async function calibrationRunDetail(actor: WeeklyActor, runId: string): Promise<CalibrationRunDetailResponse> {
  assertHr(actor)
  const run = await prisma.weeklyCalibrationRun.findUnique({ where: { id: runId } })
  if (!run) throw new WeeklyError('Calibration run not found', 404)
  const { prices } = await loadAiSettings()
  const [row] = await runRows([run], prices)
  const results = await prisma.weeklyCalibrationResult.findMany({ where: { runId }, orderBy: { id: 'asc' } })
  const [topics, labels] = await Promise.all([topicNames(results.map((r) => r.competencyId)), resultLabels(results)])
  // A running run has no stored summary yet: show the agreement so far.
  const summary = row.summary ?? summarizeCalibration(calibrationRows(results.filter((r) => r.completedAt !== null), topics), prices[run.model])
  return { run: { ...row, summary, costUsd: row.costUsd ?? summary.costUsd }, results: results.map((r) => resultView(r, topics, labels)) }
}
