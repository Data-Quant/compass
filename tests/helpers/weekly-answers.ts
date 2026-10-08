import type { WeeklyPrompt } from '@prisma/client'
import { prisma } from '../../lib/db'
import { noteRequired, parseOptions } from '../../lib/weekly/mcq'
import { submitAnswer } from '../../lib/weekly/service/inbox'
import { releaseWeek } from '../../lib/weekly/service/release'
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

/** The id of the statement with this score in a released question (the first, when the level is repeated). */
export async function optionWithScore(promptId: string, score: number): Promise<string> {
  const prompt = await prisma.weeklyPrompt.findUniqueOrThrow({ where: { id: promptId }, select: { options: true } })
  const option = parseOptions(prompt.options).find((o) => o.score === score)
  if (!option) throw new Error(`No statement scores ${score}`)
  return option.id
}

/** Chooses the statement with `score` as the question's own evaluator (with a note when one is required); returns the answer's id. */
export async function answerAs(prompt: Pick<WeeklyPrompt, 'id' | 'evaluatorId'>, score: number, now: Date = at(1, 2)): Promise<string> {
  const optionId = await optionWithScore(prompt.id, score)
  const note = noteRequired(score) ? 'A concrete example from this week.' : null
  await submitAnswer(weeklyActor(personFor(prompt.evaluatorId)), { evaluatorId: prompt.evaluatorId, actingAs: false }, prompt.id, { optionId, note }, now)
  return (await prisma.weeklyResponse.findUniqueOrThrow({ where: { promptId: prompt.id } })).id
}
