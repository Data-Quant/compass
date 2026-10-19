import type { WeeklyPrompt } from '@prisma/client'
import { prisma } from '../../lib/db'
import { fakeModel } from '../../lib/weekly/ai/model'
import { noteRequired, parseOptions } from '../../lib/weekly/mcq'
import { loadAnswerRecords } from '../../lib/weekly/service/answer-states'
import { submitAnswer } from '../../lib/weekly/service/inbox'
import { releaseWeek } from '../../lib/weekly/service/release'
import { decideAnswer } from '../../lib/weekly/service/review-queue'
import { runScoring } from '../../lib/weekly/service/scoring'
import { at } from './weekly-fixtures'
import { W, weeklyActor, type WeeklyTestPerson } from './weekly-test-db'

const PEOPLE = new Map<string, WeeklyTestPerson>(Object.values(W).map((person) => [person.id, person]))

export function personFor(id: string): WeeklyTestPerson {
  const person = PEOPLE.get(id)
  if (!person) throw new Error(`Unknown test person ${id}`)
  return person
}

/** Releases week 1 (each test evaluator gets one paced question) and returns the standard questions. */
export async function releaseWeekOne(cycleId: string): Promise<WeeklyPrompt[]> {
  await releaseWeek(cycleId, 1, at(1))
  return prisma.weeklyPrompt.findMany({ where: { cycleId, kind: 'STANDARD' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
}

/** The id of the statement at this level in a released question (the first, when the level is repeated). */
export async function optionWithScore(promptId: string, score: number): Promise<string> {
  const prompt = await prisma.weeklyPrompt.findUniqueOrThrow({ where: { id: promptId }, select: { options: true } })
  const option = parseOptions(prompt.options).find((o) => o.score === score)
  if (!option) throw new Error(`No statement at level ${score}`)
  return option.id
}

/** Chooses the statement at `level` as the question's own evaluator (with a note when one is required); returns the answer's id. */
export async function answerAs(prompt: Pick<WeeklyPrompt, 'id' | 'evaluatorId'>, level: number, now: Date = at(1, 2), note?: string): Promise<string> {
  const optionId = await optionWithScore(prompt.id, level)
  const written = note ?? (noteRequired(level) ? 'A concrete example from this week.' : null)
  await submitAnswer(weeklyActor(personFor(prompt.evaluatorId)), { evaluatorId: prompt.evaluatorId, actingAs: false }, prompt.id, { optionId, note: written }, now)
  return (await prisma.weeklyResponse.findUniqueOrThrow({ where: { promptId: prompt.id } })).id
}

/** The stand-in model scores every waiting answer (at its chosen level) and HR confirms each one. */
export async function scoreAndConfirm(cycleId: string, when: Date = at(1, 3)): Promise<void> {
  await runScoring({ model: fakeModel(), budgetMs: 30_000, clock: () => when })
  for (const record of await loadAnswerRecords({ cycleId })) {
    if (record.state !== 'NEEDS_REVIEW') continue
    // A reason, so a test's second 4 is confirmed over the cap like HR would.
    await decideAnswer(weeklyActor(W.hr), record.responseId, { action: 'ACCEPT', reason: 'Confirmed in a test', revision: record.revision }, when)
  }
}
