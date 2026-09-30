// Part D §8: the quarter's AI cost, the standards its answers were scored against, and the length–score check.
import { prisma } from '@/lib/db'
import { answerWordCount } from '../answer-rules'
import { costUsd, type ModelPrices } from '../calibration-rules'
import { pearson } from '../quality'
import type { AiCostView, StandardsUsedView } from '../view-types'
import { loadAnswerRecords } from './answer-states'

async function cycleResponseIds(cycleId: string): Promise<string[]> {
  return (await prisma.weeklyResponse.findMany({ where: { prompt: { cycleId } }, select: { id: true } })).map((r) => r.id)
}

/** Spec 8.7: every AI score's tokens (re-scores after corrections included) × its model's price. */
export async function aiCostForCycle(cycleId: string, prices: ModelPrices): Promise<AiCostView> {
  const ids = await cycleResponseIds(cycleId)
  const sums = ids.length === 0 ? [] : await prisma.weeklyAiScore.groupBy({ by: ['model'], where: { responseId: { in: ids } }, _sum: { inputTokens: true, outputTokens: true } })
  const byModel = sums
    .map((row) => {
      const tokens = { inputTokens: row._sum.inputTokens ?? 0, outputTokens: row._sum.outputTokens ?? 0 }
      return { model: row.model, ...tokens, usd: costUsd(tokens, prices[row.model]) }
    })
    .sort((a, b) => a.model.localeCompare(b.model))
  const unpricedModels = byModel.filter((m) => m.usd === null).map((m) => m.model)
  return {
    usd: unpricedModels.length > 0 ? null : byModel.reduce((sum, m) => sum + (m.usd ?? 0), 0),
    inputTokens: byModel.reduce((sum, m) => sum + m.inputTokens, 0),
    outputTokens: byModel.reduce((sum, m) => sum + m.outputTokens, 0),
    unpricedModels,
    byModel,
  }
}

/** Spec 13.1: per topic, the profile versions this quarter's answers were scored against, with how many answers each. */
export async function standardsUsed(cycleId: string): Promise<StandardsUsedView[]> {
  const ids = await cycleResponseIds(cycleId)
  const scores = ids.length === 0 ? [] : await prisma.weeklyAiScore.findMany({ where: { responseId: { in: ids } }, select: { responseId: true, profileId: true } })
  const answersByProfile = new Map(
    [...new Set(scores.map((s) => s.profileId))].map((profileId) => [profileId, new Set(scores.filter((s) => s.profileId === profileId).map((s) => s.responseId)).size]),
  )
  const profiles = await prisma.weeklyProfile.findMany({
    where: { id: { in: [...answersByProfile.keys()] } },
    select: { id: true, version: true, status: true, approvedAt: true, competency: { select: { id: true, name: true, perspective: true } } },
  })
  const topics = [...new Set(profiles.map((p) => p.competency.id))].map((competencyId): StandardsUsedView => {
    const versions = profiles.filter((p) => p.competency.id === competencyId).sort((a, b) => a.version - b.version)
    return {
      topic: versions[0].competency.name, perspective: versions[0].competency.perspective,
      versions: versions.map((p) => ({ version: p.version, answers: answersByProfile.get(p.id) ?? 0, status: p.status, approvedAt: p.approvedAt?.toISOString() ?? null })),
    }
  })
  return topics.sort((a, b) => a.perspective.localeCompare(b.perspective) || a.topic.localeCompare(b.topic))
}

/** Pearson correlation between an answer's length and its AI score, over the quarter's sufficient scores (as the dashboard shows it). */
export async function lengthCorrelation(cycleId: string): Promise<{ correlation: number | null; scored: number }> {
  const scored = (await loadAnswerRecords({ cycleId })).filter((r) => r.aiScore?.sufficiency === 'SUFFICIENT' && r.aiScore.score !== null)
  const texts = await prisma.weeklyResponse.findMany({ where: { id: { in: scored.map((r) => r.responseId) } }, select: { id: true, situation: true, action: true, result: true } })
  const lengths = new Map(texts.map((t) => [t.id, answerWordCount(t)]))
  return { correlation: pearson(scored.map((r) => lengths.get(r.responseId) ?? 0), scored.map((r) => r.aiScore?.score ?? 0)), scored: scored.length }
}
