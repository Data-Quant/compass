import { z } from 'zod'

export type GoalStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'EXCEEDED'
export const GOAL_STATUSES: GoalStatus[] = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'EXCEEDED']

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  EXCEEDED: 'Exceeded',
}

export type SelfEvaluationQuestionType = 'TEXT' | 'LIST' | 'GOAL_TABLE'
export const SELF_EVALUATION_QUESTION_TYPES: SelfEvaluationQuestionType[] = ['TEXT', 'LIST', 'GOAL_TABLE']

export interface GoalRow {
  goal: string
  status: GoalStatus
  comments: string
}

export interface SelfEvaluationQuestionLike {
  id: string
  section: string
  prompt: string
  type: SelfEvaluationQuestionType
}

export interface SelfEvaluationAnswer {
  questionId: string
  section: string
  prompt: string
  type: SelfEvaluationQuestionType
  value: string | string[] | GoalRow[]
}

/**
 * Positions that are considered manager/partner level and therefore excluded from
 * self-evaluations (in addition to anyone who is a team lead of someone).
 */
export const SELF_EVAL_EXCLUDED_POSITIONS = ['Manager', 'Partner', 'Principal', 'Managing Partner']

export function isEligibleEmployee(p: {
  role: string
  position: string | null
  leadsAnyone: boolean
}): boolean {
  if (p.role !== 'EMPLOYEE') return false
  if (p.leadsAnyone) return false
  if (
    p.position &&
    SELF_EVAL_EXCLUDED_POSITIONS.some((x) => x.toLowerCase() === p.position!.trim().toLowerCase())
  ) {
    return false
  }
  return true
}

const goalRowSchema = z.object({
  goal: z.string().default(''),
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'EXCEEDED']),
  comments: z.string().default(''),
})

/**
 * Validate and normalize raw answers against the active question bank, producing the
 * snapshot array stored on SelfEvaluation.answers. Answers whose question is unknown or
 * inactive are dropped. Throws if a value does not match its question type.
 */
export function validateAnswers(
  questions: SelfEvaluationQuestionLike[],
  rawAnswers: Array<{ questionId: string; value: unknown }>,
): SelfEvaluationAnswer[] {
  const byId = new Map(questions.map((q) => [q.id, q]))
  const result: SelfEvaluationAnswer[] = []
  for (const raw of rawAnswers || []) {
    const q = byId.get(raw.questionId)
    if (!q) continue
    let value: SelfEvaluationAnswer['value']
    if (q.type === 'TEXT') {
      value = z.string().parse(raw.value)
    } else if (q.type === 'LIST') {
      value = z
        .array(z.string())
        .parse(raw.value)
        .map((s) => s.trim())
        .filter(Boolean)
    } else {
      value = z
        .array(goalRowSchema)
        .parse(raw.value)
        .filter((r) => r.goal.trim() || r.comments.trim())
    }
    result.push({ questionId: q.id, section: q.section, prompt: q.prompt, type: q.type, value })
  }
  return result
}

/** Alias used at submit time — identical snapshot semantics. */
export const buildSnapshot = validateAnswers
