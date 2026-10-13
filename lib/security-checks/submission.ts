// §5 Submission rules: every targeted subtask must be complete or "N/A requested".
import { unansweredQuestions, type AnswerMap, type QuestionDef } from './answers'
import type { SubtaskSource, SubtaskStatus, TaskStatus } from './types'

export interface SubtaskForSubmission {
  name: string
  source: SubtaskSource
  answers: AnswerMap
  declarationConfirmed: boolean
  naRequested: boolean
  naJustification: string | null
  activeFileCount: number
}

export const MIN_NA_JUSTIFICATION = 3

/** Problems that keep this subtask from being submitted (empty = complete). */
export function subtaskCompletionProblems(
  subtask: SubtaskForSubmission,
  questions: readonly QuestionDef[],
  evidenceRequired: boolean,
): string[] {
  if (subtask.source === 'DECLARATION') {
    return subtask.declarationConfirmed ? [] : [`Confirm “${subtask.name}”`]
  }
  if (subtask.naRequested) {
    return (subtask.naJustification ?? '').trim().length >= MIN_NA_JUSTIFICATION
      ? []
      : [`${subtask.name}: explain why it does not apply to you`]
  }
  const problems = unansweredQuestions(questions, subtask.answers).map((question) => `${subtask.name}: answer “${question.prompt}”`)
  if (evidenceRequired && subtask.activeFileCount === 0) problems.push(`${subtask.name}: attach at least one screenshot or PDF`)
  return problems
}

/** Subtasks the employee may change in the task's current round. */
export function isSubtaskEditable(taskStatus: TaskStatus, subtaskStatus: SubtaskStatus): boolean {
  if (taskStatus === 'NOT_STARTED' || taskStatus === 'IN_PROGRESS') return subtaskStatus === 'OPEN'
  if (taskStatus === 'REJECTED' || taskStatus === 'REQUIRES_INFO') return subtaskStatus === 'REJECTED' || subtaskStatus === 'REQUIRES_INFO'
  return false
}

/** Employees may request N/A on admin- or employee-defined subtasks, unless a reviewer already denied it this cycle. */
export function canRequestNa(subtask: { source: SubtaskSource; lastVerdict: string | null }): boolean {
  return (subtask.source === 'ADMIN' || subtask.source === 'EMPLOYEE') && subtask.lastVerdict !== 'DENY_NA'
}
