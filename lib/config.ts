/**
 * Application Configuration
 * 
 * Change these values to customize the platform branding
 */

// Platform name - displayed throughout the app
export const PLATFORM_NAME = 'Compass'

// Company name
export const COMPANY_NAME = 'Plutus21'

// Full platform title
export const PLATFORM_TITLE = `${PLATFORM_NAME} | ${COMPANY_NAME} Performance Platform`

// Platform description
export const PLATFORM_DESCRIPTION = 'Your central hub for performance reviews, leave management, and team collaboration at Plutus21.'

// Logo paths
export const LOGO = {
  company: '/icons/plutus21/plutus-light-48.png',
  companyDark: '/icons/plutus21/plutus-dark-48.png',
  companyLg: '/icons/plutus21/plutus-light-192.png',
  companyDarkLg: '/icons/plutus21/plutus-dark-192.png',
  signature: '/images/signature.png',
}

// Theme colors (these match the CSS variables)
export const THEME = {
  primary: '#6366f1', // Indigo
  primaryDark: '#4f46e5',
  accent: '#8b5cf6', // Purple
}

/**
 * Evaluator Configuration
 * 
 * These settings control how evaluator relationships and weights are determined
 */

// C-Level evaluators - these people's evaluations carry the C_LEVEL weight (40%)
export const C_LEVEL_EVALUATORS = [
  'Hamiz Awan',
  'Brad Herman',
  'Daniyal Awan',
  'Richard Reizes',
]

// HR evaluators - these people evaluate ALL employees with HR relationship type
export const HR_EVALUATORS = [
  'Areebah Akhlaque',
  'Saman Fahim',
  'Raveeha Hassan',
]

// Default weights for each relationship type (must sum to 1.0)
export const DEFAULT_WEIGHTS: Record<string, number> = {
  C_LEVEL: 0.35,
  TEAM_LEAD: 0.20,
  DIRECT_REPORT: 0.15,
  PEER: 0.10,
  HR: 0.05,
  DEPT: 0.15,
  SELF: 0.00, // Self-evaluation is qualitative only
}

/**
 * Calculate redistributed weights when some categories are missing
 * and no weight profile exists for this category set.
 * Falls back to proportional redistribution of DEFAULT_WEIGHTS.
 * @param availableTypes - Array of relationship types that have evaluators
 * @returns Record of relationship types to their adjusted weights
 */
export function calculateRedistributedWeights(
  availableTypes: string[]
): Record<string, number> {
  // Filter to only weights that have evaluators
  const activeWeights: Record<string, number> = {}
  let totalActiveWeight = 0

  for (const type of availableTypes) {
    if (type in DEFAULT_WEIGHTS && type !== 'SELF') {
      activeWeights[type] = DEFAULT_WEIGHTS[type as keyof typeof DEFAULT_WEIGHTS]
      totalActiveWeight += activeWeights[type]
    }
  }

  // Redistribute proportionally to sum to 1.0
  const redistributed: Record<string, number> = {}
  for (const [type, weight] of Object.entries(activeWeights)) {
    redistributed[type] = totalActiveWeight > 0 ? weight / totalActiveWeight : 0
  }

  return redistributed
}
