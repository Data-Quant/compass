import type { RelationshipType } from '@/types'

export type Perspective = 'LEAD' | 'UPWARD' | 'PEER'
export type QuestionBank = 'DIRECT_REPORT' | 'TEAM_LEAD' | 'PEER'
export type FormRelationshipType = 'C_LEVEL' | 'DEPT' | 'HR'

/** Relationship types whose evidence is collected weekly. */
export const WEEKLY_RELATIONSHIP_TYPES = ['TEAM_LEAD', 'DIRECT_REPORT', 'PEER', 'CROSS_DEPARTMENT'] as const
export type WeeklyRelationshipType = (typeof WEEKLY_RELATIONSHIP_TYPES)[number]

const PERSPECTIVE_BY_TYPE: Partial<Record<RelationshipType, Perspective>> = {
  TEAM_LEAD: 'LEAD',
  DIRECT_REPORT: 'UPWARD',
  PEER: 'PEER',
  CROSS_DEPARTMENT: 'PEER', // D32: cross-department evaluators answer the peer questions
}

/** The question bank each perspective's topics come from (Compass stores banks by who is evaluated). */
const BANK_BY_PERSPECTIVE: Record<Perspective, QuestionBank> = { LEAD: 'DIRECT_REPORT', UPWARD: 'TEAM_LEAD', PEER: 'PEER' }

/** The relationship in words, from the evaluator's side (UX spec, section 8): "About Bilal · you are their peer". */
export const RELATIONSHIP_WORDS: Record<Perspective, string> = {
  LEAD: 'you are their lead',
  UPWARD: 'they are your lead',
  PEER: 'you are their peer',
}

export const PERSPECTIVE_LABELS: Record<Perspective, string> = {
  LEAD: 'As their lead',
  UPWARD: 'As a member of their team',
  PEER: 'As a peer',
}

export const PERSPECTIVE_ORDER: readonly Perspective[] = ['LEAD', 'UPWARD', 'PEER']

export function perspectiveOf(type: RelationshipType): Perspective | null {
  return PERSPECTIVE_BY_TYPE[type] ?? null
}

export function isWeeklyRelationshipType(type: string): type is WeeklyRelationshipType {
  return (WEEKLY_RELATIONSHIP_TYPES as readonly string[]).includes(type)
}

export function bankForPerspective(perspective: Perspective): QuestionBank {
  return BANK_BY_PERSPECTIVE[perspective]
}

export function perspectiveForBank(bank: RelationshipType): Perspective | null {
  const match = PERSPECTIVE_ORDER.find((perspective) => BANK_BY_PERSPECTIVE[perspective] === bank)
  return match ?? null
}

export function isFormRelationshipType(type: RelationshipType): type is FormRelationshipType {
  return type === 'C_LEVEL' || type === 'DEPT' || type === 'HR'
}
