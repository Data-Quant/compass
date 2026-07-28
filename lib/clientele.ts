import type { ClientRole, ClientStatus } from '@prisma/client'

/**
 * Who can see and do what in Clientele.
 *
 * Three distinct positions, kept here rather than spread across routes so the
 * rules stay checkable in one place:
 *
 *  - HR governs the client list and every roster. Nobody else creates a client.
 *  - A manager sees their clients and may ask HR to change the roster. They
 *    cannot change it themselves; that is the whole point of the request.
 *  - A member sees the clients they are on and who else is on them.
 *
 * Someone can be a manager on one client and a member on another, so every check
 * is per client rather than a property of the person.
 */

export type AssignmentLike = {
  clientId: string
  role: ClientRole
}

/** Whether the Clientele section appears in this person's sidebar at all. */
export function hasClienteleAccess(assignments: readonly AssignmentLike[]): boolean {
  return assignments.length > 0
}

/** Managers get the request button; members do not. */
export function canRequestRosterChange(
  assignments: readonly AssignmentLike[],
  clientId: string
): boolean {
  return assignments.some(
    (assignment) => assignment.clientId === clientId && assignment.role === 'MANAGER'
  )
}

/** Whether this person may see a given client's roster. */
export function canViewClient(
  assignments: readonly AssignmentLike[],
  clientId: string
): boolean {
  return assignments.some((assignment) => assignment.clientId === clientId)
}

export type RosterChangeItem = {
  userId: string
  action: 'ADD' | 'REMOVE'
  role?: ClientRole | null
}

export type RequestValidation = { ok: true } | { ok: false; reason: string }

/**
 * A request has to ask for something specific.
 *
 * The note alone is not enough: HR acts on the structured items, and a request
 * with none would be an email with no action attached to it.
 */
export function validateRosterRequest(input: {
  items: readonly RosterChangeItem[]
  currentMemberIds: readonly string[]
  requestedById: string
}): RequestValidation {
  if (input.items.length === 0) {
    return { ok: false, reason: 'Select at least one person to add or remove' }
  }

  const seen = new Set<string>()
  for (const item of input.items) {
    const key = `${item.userId}:${item.action}`
    if (seen.has(key)) {
      return { ok: false, reason: 'The same change was requested twice' }
    }
    seen.add(key)
  }

  // Asking to add someone already on the roster, or remove someone who is not,
  // means the manager is working from a stale page.
  const current = new Set(input.currentMemberIds)
  for (const item of input.items) {
    if (item.action === 'ADD' && current.has(item.userId)) {
      return { ok: false, reason: 'Someone in this request is already on the roster' }
    }
    if (item.action === 'REMOVE' && !current.has(item.userId)) {
      return { ok: false, reason: 'Someone in this request is not on the roster' }
    }
  }

  // A manager removing themselves would leave them unable to follow up on their
  // own request, and possibly leave the client with no manager at all.
  if (input.items.some((item) => item.action === 'REMOVE' && item.userId === input.requestedById)) {
    return { ok: false, reason: 'Ask HR directly to remove yourself from a client' }
  }

  return { ok: true }
}

/**
 * Whether removing this assignment would leave the client with no manager.
 *
 * An unmanaged client has nobody who can request changes to it, so HR is warned
 * before creating that state rather than after.
 */
export function wouldLeaveClientUnmanaged(
  assignments: readonly { userId: string; role: ClientRole }[],
  removingUserId: string
): boolean {
  const managers = assignments.filter((assignment) => assignment.role === 'MANAGER')
  return managers.length === 1 && managers[0].userId === removingUserId
}

/** Inactive clients stay on record but drop off people's Clientele page. */
export function isVisibleClientStatus(status: ClientStatus): boolean {
  return status === 'ACTIVE'
}
