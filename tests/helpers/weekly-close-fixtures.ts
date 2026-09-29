import { fakeModel } from '../../lib/weekly/ai/model'
import { loadAnswerRecords } from '../../lib/weekly/service/answer-states'
import { decideAnswer } from '../../lib/weekly/service/decisions'
import { runScoring } from '../../lib/weekly/service/scoring'
import { answerAs, releaseWeekOne, scoringClock } from './weekly-answers'
import { at, HR_ACTOR } from './weekly-fixtures'
import { W } from './weekly-test-db'

/** HR accepts every answer waiting for review or for the 72-hour accept. */
export async function acceptWaitingIn(cycleId: string, when: Date): Promise<void> {
  for (const r of await loadAnswerRecords({ cycleId })) {
    if ((r.state === 'NEEDS_REVIEW' || r.state === 'AUTO_ACCEPT_PENDING') && r.aiScore?.sufficiency === 'SUFFICIENT') {
      await decideAnswer(HR_ACTOR, r.responseId, { action: 'ACCEPT', basedOn: { aiScoreId: r.aiScore.id, reviewId: r.latestReview?.id ?? null } }, when)
    }
  }
}

/** The lead's week-1 answer (a proposed 4) is scored and accepted. Returns the person it is about and the answer. */
export async function leadEvidenceIn(cycleId: string): Promise<{ evaluateeId: string; responseId: string }> {
  const prompt = (await releaseWeekOne(cycleId)).find((p) => p.evaluatorId === W.lead.id)
  if (!prompt) throw new Error('The lead got no question in week 1')
  const responseId = await answerAs(prompt, 'strong')
  await runScoring({ model: fakeModel(), budgetMs: 30_000, clock: () => scoringClock() })
  await acceptWaitingIn(cycleId, at(1, 3))
  return { evaluateeId: prompt.evaluateeId, responseId }
}
