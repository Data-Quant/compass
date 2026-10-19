// The classic question-bank rows HR still edits, outside the weekly topics: the quarter-end form questions
// (C-Level, Department, HR) and the weekly comment questions (written, in the three weekly banks).
// The rating questions in the weekly banks are the weekly topics, which the topic editor owns.
import { z } from 'zod'
import { isFormRelationshipType, perspectiveForBank } from './perspectives'
import type { RelationshipType } from '@/types'

export type BankQuestionType = 'RATING' | 'TEXT'

/** The quarter-end forms' banks, in the order HR sees them. */
export const FORM_BANKS = ['C_LEVEL', 'DEPT', 'HR'] as const
/** The weekly banks whose written questions are released as comment questions. */
export const COMMENT_BANKS = ['DIRECT_REPORT', 'TEAM_LEAD', 'PEER'] as const

/** Null when HR may keep this question here, otherwise why not. */
export function bankQuestionProblem(bank: RelationshipType, type: BankQuestionType): string | null {
  if (isFormRelationshipType(bank)) return null
  if (perspectiveForBank(bank)) return type === 'TEXT' ? null : 'Rating questions in this bank are weekly topics: change them under the weekly topics above'
  return 'This question bank is no longer used'
}

/** Every bank question HR manages here, as a Prisma filter. */
export const MANAGED_BANK_QUESTIONS = {
  OR: [
    { relationshipType: { in: [...FORM_BANKS] } },
    { relationshipType: { in: [...COMMENT_BANKS] }, questionType: 'TEXT' as const },
  ],
}

const ratingDescriptionsSchema = z.object({ 1: z.string().max(500), 2: z.string().max(500), 3: z.string().max(500), 4: z.string().max(500) }).partial()

const questionFields = {
  questionText: z.string().trim().min(1, 'Write the question').max(1000),
  questionType: z.enum(['RATING', 'TEXT']),
  ratingDescriptions: ratingDescriptionsSchema.optional(),
}

export const createBankQuestionSchema = z.object({
  relationshipType: z.enum([...FORM_BANKS, ...COMMENT_BANKS]),
  ...questionFields,
}).strict()

export const updateBankQuestionSchema = z.object({ id: z.string().min(1), ...questionFields }).strict()

export const deleteBankQuestionSchema = z.object({ id: z.string().min(1) }).strict()
