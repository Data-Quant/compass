// Submitted weekly answers with their scores. A multiple-choice answer is scored the moment it is given (UX spec,
// section 8), so there is no scoring or review state: an answer either has a score or is a comment.
import type { RelationshipType, WeeklyPromptKind } from '@prisma/client'
import { prisma } from '@/lib/db'
import { perspectiveOf, type Perspective } from '../perspectives'
import type { Db } from './db'

export interface AnswerRecord {
  responseId: string
  promptId: string
  cycleId: string
  slotId: string | null
  competencyId: string | null
  topic: string
  perspective: Perspective
  evaluatorId: string
  evaluateeId: string
  relationshipType: RelationshipType
  kind: WeeklyPromptKind
  weekIndex: number
  submittedAt: Date | null
  /** The chosen statement's score, 1 to 4 in half points. */
  score: number
}

/** Every submitted multiple-choice answer, with its score. No notes. */
export async function loadAnswerRecords(filter: { cycleId?: string; evaluateeId?: string; evaluatorId?: string }, db: Db = prisma): Promise<AnswerRecord[]> {
  const prompts = await db.weeklyPrompt.findMany({
    where: {
      ...(filter.cycleId ? { cycleId: filter.cycleId } : {}),
      ...(filter.evaluateeId ? { evaluateeId: filter.evaluateeId } : {}),
      ...(filter.evaluatorId ? { evaluatorId: filter.evaluatorId } : {}),
      status: 'SUBMITTED',
      kind: 'STANDARD',
      response: { is: { score: { not: null } } },
    },
    select: {
      id: true, cycleId: true, slotId: true, evaluatorId: true, evaluateeId: true, relationshipType: true, kind: true, weekIndex: true,
      response: { select: { id: true, submittedAt: true, score: true } },
      slot: { select: { competencyId: true, competency: { select: { name: true, perspective: true } } } },
    },
    orderBy: [{ weekIndex: 'asc' }, { createdAt: 'asc' }],
  })
  return prompts.flatMap((p): AnswerRecord[] => {
    if (!p.response || p.response.score === null) return []
    return [{
      responseId: p.response.id, promptId: p.id, cycleId: p.cycleId, slotId: p.slotId, competencyId: p.slot?.competencyId ?? null,
      topic: p.slot?.competency.name ?? 'Question', perspective: perspectiveOf(p.relationshipType) ?? p.slot?.competency.perspective ?? 'PEER',
      evaluatorId: p.evaluatorId, evaluateeId: p.evaluateeId, relationshipType: p.relationshipType, kind: p.kind, weekIndex: p.weekIndex,
      submittedAt: p.response.submittedAt, score: p.response.score,
    }]
  })
}
