export type RelationshipType = 'DIRECT_REPORT' | 'TEAM_LEAD' | 'PEER' | 'C_LEVEL' | 'HR' | 'DEPT' | 'SELF'
export type UserRole = 'EMPLOYEE' | 'HR' | 'SECURITY' | 'OA'
export type QuestionType = 'RATING' | 'TEXT'
export type EmailStatus = 'PENDING' | 'SENT' | 'FAILED'

export const DEFAULT_WEIGHTAGES: Record<RelationshipType, number> = {
  C_LEVEL: 0.35,
  TEAM_LEAD: 0.20,
  DIRECT_REPORT: 0.15,
  PEER: 0.10,
  HR: 0.05,
  DEPT: 0.15,
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
  C_LEVEL: 'C-Level (Hamiz)',
  HR: 'HR Personnel',
  DEPT: 'Department (Hamiz)',
  SELF: 'Self-Evaluation',
}

/**
 * Convert a set of relationship types to a canonical category set key
 * Used for matching against weight profiles
 */
export function toCategorySetKey(types: string[]): string {
  return [...types].filter(t => t !== 'SELF').sort().join(',')
}

/**
 * CSV category name → RelationshipType mapping
 */
export const CSV_CATEGORY_MAP: Record<string, RelationshipType> = {
  'Lead': 'TEAM_LEAD',
  'Team Lead': 'TEAM_LEAD',
  'Direct Reports (Team Member)': 'DIRECT_REPORT',
  'Peer': 'PEER',
  'HR': 'HR',
  'Hamiz': 'C_LEVEL',
  'Dept': 'DEPT',
}
