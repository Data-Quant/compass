import type { TeamTag } from '@prisma/client'
import { isAdminRole } from '@/lib/permissions'
import { ALL_TEAMS } from './teams'

/** The pseudo-team HR selects to preview what a user with no team tag sees. */
export const PREVIEW_UNTAGGED = 'UNTAGGED'

/**
 * The team a Handbook request resolves against.
 *
 * Normally the session user's own tag. HR may override it with ?previewTeam=
 * to see any team's view -- and ONLY HR: for anyone else the override is
 * silently ignored and they fall back to their own tag, so it can never be
 * used to read another team's terms.
 *
 * Pure (takes the raw param, not the request) so the privilege boundary can be
 * tested exhaustively without a server or a database.
 */
export function resolvePreviewTeam(
  requested: string | null,
  user: { role: string; teamTag: TeamTag | null }
): TeamTag | null {
  if (!requested || !isAdminRole(user.role)) return user.teamTag
  if (requested === PREVIEW_UNTAGGED) return null
  // An unrecognised team is a typo or a probe, not a reason to show nothing.
  return (ALL_TEAMS as readonly string[]).includes(requested)
    ? (requested as TeamTag)
    : user.teamTag
}
