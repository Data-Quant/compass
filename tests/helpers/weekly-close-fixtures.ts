import { answerAs, releaseWeekOne } from './weekly-answers'
import { W } from './weekly-test-db'

/** The lead's week-1 question is answered with a 4 (the lead's one top rating). Returns the person it is about and the answer. */
export async function leadEvidenceIn(cycleId: string): Promise<{ evaluateeId: string; responseId: string }> {
  const prompt = (await releaseWeekOne(cycleId)).find((p) => p.evaluatorId === W.lead.id)
  if (!prompt) throw new Error('The lead got no question in week 1')
  const responseId = await answerAs(prompt, 4)
  return { evaluateeId: prompt.evaluateeId, responseId }
}
