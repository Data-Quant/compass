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

/**
 * Teams whose public holidays are always the same.
 *
 * Pakistan only. PAKISTAN and THREE_E_PAKISTAN are one country split by employing
 * entity, and a Pakistani national holiday reaches everyone there -- the same
 * reasoning the original team-tagging migration used when it backfilled both.
 *
 * MOROCCO and THREE_E_MOROCCO are deliberately NOT paired. Despite sitting in the
 * same country, 3E Morocco observes US public holidays rather than Moroccan ones,
 * so a Moroccan holiday must not widen to them. Their holidays are recorded as
 * ordinary rows tagged THREE_E_MOROCCO.
 */
export const COUNTRY_TEAM_GROUPS: readonly (readonly TeamTag[])[] = [
  ['PAKISTAN', 'THREE_E_PAKISTAN'],
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
