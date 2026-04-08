export type RelationshipType =
  | 'DIRECT_REPORT'
  | 'TEAM_LEAD'
  | 'PEER'
  | 'C_LEVEL'
  | 'HR'
  | 'DEPT'
  | 'CROSS_DEPARTMENT'
  | 'SELF'
export type UserRole = 'EMPLOYEE' | 'HR' | 'SECURITY' | 'OA'
export type QuestionType = 'RATING' | 'TEXT'
export type EmailStatus = 'PENDING' | 'SENT' | 'FAILED'

export function normalizeRelationshipTypeForWeighting(type: RelationshipType): RelationshipType {
  return type === 'CROSS_DEPARTMENT' ? 'PEER' : type
}

export const DEFAULT_WEIGHTAGES: Record<RelationshipType, number> = {
  C_LEVEL: 0.35,
  TEAM_LEAD: 0.20,
  DIRECT_REPORT: 0.15,
  PEER: 0.10,
  HR: 0.05,
  DEPT: 0.15,
  CROSS_DEPARTMENT: 0.0,
  SELF: 0.0, // Self-evaluation typically not included in weighted score
}

export const RATING_LABELS: Record<number, { label: string; description: string }> = {
  4: {
    label: 'Transforming The Business',
    description: 'Drove transformational impact and significantly exceeded expectations.',
  },
  3: {
    label: 'Exceeds Expectations',
    description: 'Consistently delivered above role expectations and went beyond the brief.',
  },
  2: {
    label: 'Meets Expectations',
    description: 'Fully met expectations and delivered solid work at the expected level.',
  },
  1: {
    label: 'Does Not Meet Expectations',
    description: 'Did not consistently meet expectations and needs meaningful improvement.',
  },
}

export const RELATIONSHIP_TYPE_LABELS: Record<RelationshipType, string> = {
  DIRECT_REPORT: 'Direct Reports (Team Members)',
  TEAM_LEAD: 'Team Lead/Manager',
  PEER: 'Peers',
  C_LEVEL: 'C-Level (Hamiz)',
  HR: 'HR Personnel',
  DEPT: 'Department (Hamiz)',
  CROSS_DEPARTMENT: 'Cross-Department',
  SELF: 'Self-Evaluation',
}

/**
 * Convert a set of relationship types to a canonical category set key
 * Used for matching against weight profiles
 */
export function toCategorySetKey(types: string[]): string {
  return [...new Set(
    types
      .filter((t) => t !== 'SELF')
      .map((t) => normalizeRelationshipTypeForWeighting(t as RelationshipType))
  )]
    .sort()
    .join(',')
}

/**
 * CSV category name -> RelationshipType mapping
 */
export const CSV_CATEGORY_MAP: Record<string, RelationshipType> = {
  Lead: 'TEAM_LEAD',
  'Team Lead': 'TEAM_LEAD',
  'Direct Reports (Team Member)': 'DIRECT_REPORT',
  Peer: 'PEER',
  'Cross Department': 'CROSS_DEPARTMENT',
  HR: 'HR',
  Hamiz: 'C_LEVEL',
  Dept: 'DEPT',
}
