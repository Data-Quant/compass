import type { TeamTag } from '@prisma/client'

/** Every person-level team. Order is display order. */
export const ALL_TEAMS: readonly TeamTag[] = [
  'PAKISTAN',
  'MOROCCO',
  'COLOMBIA',
  'INDONESIA',
  'NOBLE',
  'THREE_E_PAKISTAN',
  'THREE_E_MOROCCO',
] as const

/** "Plutus21 Internal Team" -- everyone except the two 3E teams. */
export const INTERNAL_TEAMS: readonly TeamTag[] = [
  'PAKISTAN',
  'MOROCCO',
  'COLOMBIA',
  'INDONESIA',
  'NOBLE',
] as const

export const TEAM_LABELS: Record<TeamTag, string> = {
  PAKISTAN: 'Pakistan Team',
  MOROCCO: 'Morocco Team',
  COLOMBIA: 'Colombia Team',
  INDONESIA: 'Indonesia Team',
  NOBLE: 'Noble Team',
  THREE_E_PAKISTAN: '3E Pakistan Team',
  THREE_E_MOROCCO: '3E Morocco Team',
}

/**
 * Derived groups. These are never stored on a user or a variant -- they expand
 * to the underlying teams at author time.
 */
export type AudienceGroup = 'EVERYONE' | 'PLUTUS21_INTERNAL'

export function expandGroup(group: AudienceGroup): TeamTag[] {
  return group === 'EVERYONE' ? [...ALL_TEAMS] : [...INTERNAL_TEAMS]
}
