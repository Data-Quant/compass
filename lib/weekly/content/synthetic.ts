// Synthetic answers for preview testing only. Deterministic per seed so runs are repeatable.
import type { AnswerFields } from '../answer-rules'

export type SyntheticQuality = 'STRONG' | 'SOLID' | 'WEAK' | 'EMPTY_PRAISE' | 'SENSITIVE'

const MIX: readonly SyntheticQuality[] = ['STRONG', 'SOLID', 'SOLID', 'WEAK', 'SOLID', 'EMPTY_PRAISE', 'STRONG', 'SOLID', 'WEAK', 'SENSITIVE']

function hash(seed: string): number {
  let value = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    value ^= seed.charCodeAt(i)
    value = Math.imul(value, 16777619)
  }
  return value >>> 0
}

type Pools = { situation: Array<(topic: string) => string>; action: string[]; result: string[]; shortfall: string }

const POOLS: Record<SyntheticQuality, Pools> = {
  STRONG: {
    situation: [
      (t) => `The client brought a launch forward by a week, and ${t} became critical for the handover.`,
      (t) => `Two days before the quarterly close our largest account changed its reporting format, which put ${t} under real pressure.`,
      (t) => `A new joiner was struggling with the onboarding project, and ${t} decided whether the team would hit the milestone.`,
    ],
    action: [
      'Without being asked, they rebuilt the plan the same afternoon, split the work with named owners, and checked every deliverable against the client brief before it went out.',
      'They mapped the new format against our templates overnight, wrote a short checklist for the team, and paired with each analyst until the first files passed review.',
      'They set up two short working sessions a day, turned the recurring questions into a written guide, and reviewed each piece of work within a few hours.',
    ],
    result: [
      'We delivered on the new date with no rework, and two other teams have since adopted the plan.',
      'Every file was accepted first time, and the checklist is now the standard for the whole department.',
      'The milestone landed on time, and other teams have adopted the guide for their own new joiners.',
    ],
    shortfall: 'The first draft missed one dependency, which they caught and fixed within a day.',
  },
  SOLID: {
    situation: [
      (t) => `Last week we had the monthly report for our largest account, where ${t} mattered.`,
      (t) => `We had a routine data refresh for the operations dashboard, which relied on ${t}.`,
      (t) => `A client asked for an updated forecast before their board meeting, which tested ${t}.`,
    ],
    action: [
      'They did what was asked on time, raised one data question with me the same day, and made the two small fixes I suggested after my review.',
      'They followed the usual checklist, flagged a missing input early in the week, and refreshed the numbers once the operations team sent it through.',
      'They prepared the forecast from the agreed model, walked me through the main changes, and answered the follow-up questions from finance.',
    ],
    result: [
      'The report went out on schedule and the client accepted it without any follow-up questions.',
      'The dashboard refreshed on the planned date and the operations team used it in their weekly meeting.',
      'The client received the forecast a day before the meeting and did not ask for any corrections.',
    ],
    shortfall: '',
  },
  WEAK: {
    situation: [
      (t) => `The pricing model due on the 15th, where ${t} was part of the work.`,
      (t) => `The client presentation for the renewal meeting, where ${t} was expected.`,
      (t) => `The data migration for the finance team, which depended on ${t}.`,
    ],
    action: [
      'I had to chase the missing inputs twice, and the blocker only came up on the due date even though it had been known for a week.',
      'The draft arrived late with several numbers that did not match the source files, and I had to chase the corrections over two days.',
      'They did not raise that the extract was failing, so I found out from the finance team and had to chase an update myself.',
    ],
    result: [
      'The deadline slipped by two days and I had to rebuild part of the model myself over the weekend.',
      'We presented a day late and the client asked for a revised version before they would sign.',
      'The migration slipped by a week and the finance team had to run the old process in parallel.',
    ],
    shortfall: 'The same pattern as the previous deliverable.',
  },
  EMPTY_PRAISE: {
    situation: [
      (t) => `Working with them in general, especially on ${t}.`,
      (t) => `Every day on the team, and ${t} in particular.`,
      (t) => `All the time, whatever the work is, including ${t}.`,
    ],
    action: [
      'They are honestly amazing, always super positive, the best person on the team, and everyone loves working with them every single day without exception.',
      'Everyone loves them, they are always amazing to work with, and they bring great energy and a brilliant attitude to absolutely everything they touch.',
      'They are simply the best person on the team, always amazing, always helpful and always happy, and nobody could ask for a better colleague at all.',
    ],
    result: [
      'Everything is always great when they are around and the whole team is happy and motivated all of the time.',
      'The team is better because of them and everyone feels more positive every single week of the year.',
      'It is always a pleasure, and things just go well whenever they are involved in anything at all.',
    ],
    shortfall: '',
  },
  SENSITIVE: {
    situation: [
      (t) => `The audit pack for the client, where ${t} was tested.`,
      (t) => `The quarterly compliance filing, which relied on ${t}.`,
      (t) => `The board pack for the investor update, where ${t} mattered.`,
    ],
    action: [
      'They delivered it two days late and told me they have been dealing with a serious health condition with several hospital appointments this month, and asked me to keep it private.',
      'They missed two check-ins and later explained that a family member was in hospital and their own health had suffered, and asked that it stay between us.',
      'They handed over part of the work early because of a medical procedure, told me about a health issue in confidence, and arranged cover for the rest.',
    ],
    result: [
      'We asked the client for an extension, which they gave, and the pack itself was accurate and complete.',
      'The filing went in on the final day and needed no corrections from the regulator.',
      'The board pack went out on time and the investor relations team had no further questions.',
    ],
    shortfall: 'Late delivery.',
  },
}

export function syntheticAnswer(seed: string, topic: string): Required<AnswerFields> & { quality: SyntheticQuality } {
  const quality = MIX[hash(seed) % MIX.length]
  const pools = POOLS[quality]
  const pick = <T>(list: readonly T[], salt: string) => list[hash(`${seed}:${salt}`) % list.length]
  return {
    quality,
    situation: pick(pools.situation, 'situation')(topic.toLowerCase()),
    action: pick(pools.action, 'action'),
    result: pick(pools.result, 'result'),
    shortfall: pools.shortfall,
  }
}

const COMMENTS = [
  'Keep sharing plans early; it made a real difference to the team this quarter.',
  'More regular check-ins would help everyone plan their week better.',
  'A strong quarter overall; the handover notes were especially useful.',
]

export function syntheticComment(seed: string): string {
  return COMMENTS[hash(seed) % COMMENTS.length]
}
