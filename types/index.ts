export type RelationshipType = 'DIRECT_REPORT' | 'TEAM_LEAD' | 'PEER' | 'C_LEVEL' | 'HR' | 'SELF'
export type UserRole = 'EMPLOYEE' | 'HR'
export type QuestionType = 'RATING' | 'TEXT'
export type EmailStatus = 'PENDING' | 'SENT' | 'FAILED'

export const DEFAULT_WEIGHTAGES: Record<RelationshipType, number> = {
  C_LEVEL: 0.40,
  TEAM_LEAD: 0.30,
  DIRECT_REPORT: 0.15,
  PEER: 0.10,
  HR: 0.05,
  SELF: 0.00, // Self-evaluation typically not included in weighted score
}

export const RATING_LABELS: Record<number, { label: string; description: string }> = {
  4: { label: 'Exceptional', description: 'Transformed the business — significantly exceeded expectations and drove transformational impact' },
  3: { label: 'Exceeds', description: 'Went above and beyond — consistently delivered beyond role requirements' },
  2: { label: 'Meets', description: 'Did their job well — fully met all expectations and delivered quality work' },
  1: { label: 'Below', description: 'Needs improvement — did not consistently meet expectations; development required' },
}

export const RELATIONSHIP_TYPE_LABELS: Record<RelationshipType, string> = {
  DIRECT_REPORT: 'Direct Reports (Team Members)',
  TEAM_LEAD: 'Team Lead/Manager',
  PEER: 'Peers',
  C_LEVEL: 'C-Level Executives',
  HR: 'HR Personnel',
  SELF: 'Self-Evaluation',
}
