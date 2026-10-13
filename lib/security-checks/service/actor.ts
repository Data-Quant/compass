import { prisma } from '@/lib/db'
import type { SafeUser } from '@/lib/auth'
import { hasConsoleAdminSeat, type SecurityActor } from '../access'
import type { AuditEntry } from './audit'
import type { Db } from './db'
import { forbidden } from './errors'

export async function loadSecurityActor(user: Pick<SafeUser, 'id' | 'role'>, db: Db = prisma): Promise<SecurityActor> {
  const grant = await db.securityConsoleGrant.findUnique({ where: { userId: user.id }, select: { id: true } })
  return { id: user.id, role: user.role, isConsoleAdmin: hasConsoleAdminSeat(user.role, grant !== null) }
}

export function requireCapability(allowed: boolean, message?: string): void {
  if (!allowed) throw forbidden(message)
}

export function actorRoleLabel(actor: SecurityActor): string {
  if (actor.role === 'SECURITY') return 'SECURITY_ADMIN'
  return actor.isConsoleAdmin ? 'CONSOLE_ADMIN' : 'EMPLOYEE'
}

export function actorEntry(
  actor: SecurityActor,
  action: string,
  targetType: string,
  rest: Omit<AuditEntry, 'actorId' | 'actorRole' | 'action' | 'targetType'> = {},
): AuditEntry {
  return { actorId: actor.id, actorRole: actorRoleLabel(actor), action, targetType, ...rest }
}
