import type { WeeklyPrompt } from '@prisma/client'
import { prisma } from '../../lib/db'
import { fakeModel, ModelError, type ModelErrorCode, type ModelRequest, type StructuredModel } from '../../lib/weekly/ai/model'
import type { AnswerFields } from '../../lib/weekly/answer-rules'
import { submitAnswer } from '../../lib/weekly/service/inbox'
import { releaseWeek } from '../../lib/weekly/service/release'
import { at } from './weekly-fixtures'
import { W, weeklyActor, type WeeklyTestPerson } from './weekly-test-db'

export type AnswerKind = 'strong' | 'solid' | 'praise' | 'sensitive'
const PEOPLE = new Map<string, WeeklyTestPerson>(Object.values(W).map((person) => [person.id, person]))

export function personFor(id: string): WeeklyTestPerson {
  const person = PEOPLE.get(id)
  if (!person) throw new Error(`Unknown test person ${id}`)
  return person
}

/**
 * Answers the stand-in model scores predictably (strong → 4, solid → 2, praise → not enough evidence,
 * sensitive → flagged). Each names both people and has 40+ words across the three boxes.
 */
export function answerFor(kind: AnswerKind, prompt: Pick<WeeklyPrompt, 'evaluatorId' | 'evaluateeId'>): Required<AnswerFields> {
  const evaluator = personFor(prompt.evaluatorId).name
  const evaluatee = personFor(prompt.evaluateeId).name
  const first = evaluatee.split(' ')[0]
  switch (kind) {
    case 'strong':
      return {
        situation: `${evaluator} asked ${evaluatee} to prepare the client handover for Project Kestrel after the launch moved forward by a full week.`,
        action: `Without being asked, ${first} rebuilt the plan that afternoon, split the work between named owners and checked every deliverable against the brief.`,
        result: `We delivered on the new date with no rework, and two other teams have since adopted ${first}'s plan for their own launches.`,
        shortfall: '',
      }
    case 'solid':
      return {
        situation: `Last week the monthly report for our largest account was due, and ${first} had to match the finance ledger exactly.`,
        action: 'They prepared the report from the agreed model, raised one data question with me on the same day and made the two fixes I asked for.',
        result: 'The report went out on schedule and the client accepted it without any follow-up questions from their team.',
        shortfall: '',
      }
    case 'praise':
      return {
        situation: `Working with ${first} in general over the last few weeks, across every project we have shared on the team.`,
        action: 'They are honestly amazing, always positive, the best person on the team, and everyone loves working with them every single day.',
        result: 'Everything is always great when they are around and the whole team feels happy and motivated all of the time.',
        shortfall: '',
      }
    case 'sensitive':
      return {
        situation: `The audit pack for the client was due at the end of the month and ${first} owned the reconciliations.`,
        action: 'They told me about a serious health condition with several hospital appointments this month, asked me to keep it private, and still finished the reconciliations.',
        result: 'We asked the client for an extension of two days, which they gave, and the pack itself was accurate and complete.',
        shortfall: '',
      }
  }
}

/** Releases week 1 (each test evaluator gets one paced question) and returns the standard questions. */
export async function releaseWeekOne(cycleId: string): Promise<WeeklyPrompt[]> {
  await releaseWeek(cycleId, 1, at(1))
  return prisma.weeklyPrompt.findMany({ where: { cycleId, kind: 'STANDARD' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
}

/** Submits as the question's own evaluator; returns the answer's id. */
export async function answerAs(
  prompt: Pick<WeeklyPrompt, 'id' | 'evaluatorId' | 'evaluateeId'>,
  kindOrFields: AnswerKind | AnswerFields,
  now: Date = at(1, 2),
): Promise<string> {
  const fields = typeof kindOrFields === 'string' ? answerFor(kindOrFields, prompt) : kindOrFields
  await submitAnswer(weeklyActor(personFor(prompt.evaluatorId)), { evaluatorId: prompt.evaluatorId, actingAs: false }, prompt.id, fields, now)
  return (await prisma.weeklyResponse.findUniqueOrThrow({ where: { promptId: prompt.id } })).id
}

/** Records every request; answers like the stand-in, or always with `value` when given. */
export function spyModel(value?: unknown): StructuredModel & { requests: ModelRequest[] } {
  const requests: ModelRequest[] = []
  const stand = fakeModel()
  return {
    name: 'spy',
    requests,
    async complete(request) {
      requests.push(request)
      return value === undefined ? stand.complete(request) : { value, inputTokens: 10, outputTokens: 5 }
    },
  }
}

export function failingModel(code: ModelErrorCode): StructuredModel {
  return { name: 'failing', async complete() { throw new ModelError(code) } }
}

/** Tuesday of week 1, 09:00 Karachi, plus `seconds`. */
export function scoringClock(seconds = 0): Date {
  return new Date(at(1, 2).getTime() + seconds * 1000)
}
