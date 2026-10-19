// Question answers. Yes/No questions carry the admin-set compliant answer; a
// differing answer is non-compliant and can never be Verified (§5).
import type { QuestionType } from './types'

export interface QuestionDef {
  id: string
  type: QuestionType
  prompt: string
  compliantAnswer: boolean | null
}

export type AnswerValue = boolean | string
export type AnswerMap = Readonly<Record<string, AnswerValue>>

export const MAX_TEXT_ANSWER = 500

/** Keeps only known questions with correctly typed values; trims text. */
export function sanitizeAnswers(questions: readonly QuestionDef[], raw: unknown): AnswerMap {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const input = raw as Record<string, unknown>
  const result: Record<string, AnswerValue> = {}
  for (const question of questions) {
    const value = input[question.id]
    if (question.type === 'YES_NO') {
      if (typeof value === 'boolean') result[question.id] = value
    } else if (typeof value === 'string') {
      const text = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX_TEXT_ANSWER)
      if (text) result[question.id] = text
    }
  }
  return result
}

export function unansweredQuestions(questions: readonly QuestionDef[], answers: AnswerMap): QuestionDef[] {
  return questions.filter((question) => answers[question.id] === undefined)
}

export function nonCompliantQuestions(questions: readonly QuestionDef[], answers: AnswerMap): QuestionDef[] {
  return questions.filter(
    (question) =>
      question.type === 'YES_NO' &&
      question.compliantAnswer !== null &&
      typeof answers[question.id] === 'boolean' &&
      answers[question.id] !== question.compliantAnswer,
  )
}

export function isCompliant(questions: readonly QuestionDef[], answers: AnswerMap): boolean {
  return nonCompliantQuestions(questions, answers).length === 0
}
