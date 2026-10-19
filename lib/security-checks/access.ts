// §13 Access control matrix — enforced server-side on every endpoint.
// Security Admin = User.role SECURITY. Console Admin (read-only) = every HR
// user automatically, plus anyone a Security Admin grants a seat.
import type { AppUserRole } from '@/lib/permissions'

export interface SecurityActor {
  id: string
  role: AppUserRole
  isConsoleAdmin: boolean
}

/** HR always has the read-only Console Admin view; others need an explicit grant. */
export function hasConsoleAdminSeat(role: AppUserRole, hasGrant: boolean): boolean {
  return role === 'HR' || hasGrant
}

export function isSecurityAdmin(actor: SecurityActor): boolean {
  return actor.role === 'SECURITY'
}

export function canViewConsole(actor: SecurityActor): boolean {
  return isSecurityAdmin(actor) || actor.isConsoleAdmin
}

export function canManageCampaigns(actor: SecurityActor): boolean {
  return isSecurityAdmin(actor)
}

export function canReview(actor: SecurityActor): boolean {
  return isSecurityAdmin(actor)
}

/** Extensions, exemptions, task-level N/A, reopen. */
export function canManageTasks(actor: SecurityActor): boolean {
  return isSecurityAdmin(actor)
}

export function canViewEvidence(actor: SecurityActor, ownerId: string): boolean {
  return actor.id === ownerId || canViewConsole(actor)
}

export function canDownloadEvidence(actor: SecurityActor, ownerId: string): boolean {
  return actor.id === ownerId || isSecurityAdmin(actor)
}

export function canExportCsv(actor: SecurityActor): boolean {
  return isSecurityAdmin(actor)
}

export function canViewAuditLog(actor: SecurityActor): boolean {
  return isSecurityAdmin(actor)
}

export function canManageConsoleGrants(actor: SecurityActor): boolean {
  return isSecurityAdmin(actor)
}

export function canViewSelfReviewReport(actor: SecurityActor): boolean {
  return canViewConsole(actor)
}

export interface SecurityCapabilities {
  console: boolean
  manageCampaigns: boolean
  review: boolean
  manageTasks: boolean
  exportCsv: boolean
  auditLog: boolean
  manageGrants: boolean
}

export function capabilitiesOf(actor: SecurityActor): SecurityCapabilities {
  return {
    console: canViewConsole(actor),
    manageCampaigns: canManageCampaigns(actor),
    review: canReview(actor),
    manageTasks: canManageTasks(actor),
    exportCsv: canExportCsv(actor),
    auditLog: canViewAuditLog(actor),
    manageGrants: canManageConsoleGrants(actor),
  }
}
