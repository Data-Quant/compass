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

const TEMPLATES: Record<SyntheticQuality, (topic: string) => Required<AnswerFields>> = {
  STRONG: (topic) => ({
    situation: `The client brought a launch forward by a week, and ${topic.toLowerCase()} became critical for the handover.`,
    action: 'Without being asked, they rebuilt the plan the same afternoon, split the work with named owners, and checked every deliverable against the client brief before it went out. They also wrote up the approach so the rest of the team could reuse it.',
    result: 'We delivered on the new date with no rework, the client used the plan in their own board update, and two other teams have since adopted the template.',
    shortfall: 'The first draft of the plan missed one dependency, which they caught and fixed within a day.',
  }),
  SOLID: (topic) => ({
    situation: `Last week we had the monthly report for our largest account, where ${topic.toLowerCase()} mattered.`,
    action: 'They did what was asked on time, raised one data question with me the same day, and made the two small fixes I suggested after my review.',
    result: 'The report went out on schedule and the client accepted it without any follow-up questions.',
    shortfall: '',
  }),
  WEAK: (topic) => ({
    situation: `The pricing model due on the 15th, where ${topic.toLowerCase()} was part of the work.`,
    action: 'I had to chase the missing inputs twice, and the blocker only came up on the due date even though it had been known for a week.',
    result: 'The deadline slipped by two days and I had to rebuild part of the model myself over the weekend.',
    shortfall: 'The same pattern as the previous deliverable.',
  }),
  EMPTY_PRAISE: (topic) => ({
    situation: `Working with them in general, especially on ${topic.toLowerCase()}.`,
    action: 'They are honestly amazing, always super positive, the best person on the team, and everyone loves working with them every single day without exception.',
    result: 'Everything is always great when they are around and the whole team is happy and motivated all of the time.',
    shortfall: '',
  }),
  SENSITIVE: (topic) => ({
    situation: `The audit pack for the client, where ${topic.toLowerCase()} was tested.`,
    action: 'They delivered it two days late and told me they have been dealing with a serious health condition with several hospital appointments this month, and asked me to keep it private.',
    result: 'We asked the client for an extension, which they gave, and the pack itself was accurate and complete.',
    shortfall: 'Late delivery.',
  }),
}

const COMMENTS = [
  'Keep sharing plans early; it made a real difference to the team this quarter.',
  'More regular check-ins would help everyone plan their week better.',
  'A strong quarter overall; the handover notes were especially useful.',
]

export function syntheticAnswer(seed: string, topic: string): Required<AnswerFields> & { quality: SyntheticQuality } {
  const quality = MIX[hash(seed) % MIX.length]
  return { quality, ...TEMPLATES[quality](topic) }
}

export function syntheticComment(seed: string): string {
  return COMMENTS[hash(seed) % COMMENTS.length]
}
