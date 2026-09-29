import { prisma } from '@/lib/db'
import type { SafeUser } from '@/lib/auth'
import type { KpiActor } from '../permissions'
import { buildKpiScope, departmentKeyOf, type KpiScope, type ScopeUser } from '../scope'
import type { PersonRef } from '../view-types'
import type { Db } from './db'

export interface KpiContext {
  scope: KpiScope
  usersById: ReadonlyMap<string, ScopeUser>
}

export async function loadKpiContext(db: Db = prisma): Promise<KpiContext> {
  const [users, mappings, assignments] = await Promise.all([
    db.user.findMany({
      select: {
        id: true, name: true, position: true, department: true,
        payrollProfile: { select: { isPayrollActive: true, exitDate: true } },
      },
    }),
    db.evaluatorMapping.findMany({
      where: { relationshipType: 'TEAM_LEAD' },
      select: { evaluatorId: true, evaluateeId: true, relationshipType: true },
    }),
    db.kpiSetterAssignment.findMany({ select: { employeeId: true, setterId: true } }),
  ])
  const scopeUsers: ScopeUser[] = users.map((user) => ({
    id: user.id,
    name: user.name,
    position: user.position,
    department: user.department,
    payrollActive: user.payrollProfile?.isPayrollActive ?? true,
    exitDate: user.payrollProfile?.exitDate ?? null,
  }))
  return { scope: buildKpiScope(scopeUsers, mappings, assignments), usersById: new Map(scopeUsers.map((user) => [user.id, user])) }
}

export async function loadActor(
  user: Pick<SafeUser, 'id' | 'role' | 'position' | 'department'>,
  db: Db = prisma,
): Promise<KpiActor> {
  const grants = await db.kpiRoleGrant.findMany({ where: { userId: user.id }, select: { role: true } })
  return {
    id: user.id,
    role: user.role,
    position: user.position,
    departmentKey: departmentKeyOf(user.department),
    grants: grants.map((grant) => grant.role),
  }
}

export function personRef(ctx: KpiContext, id: string): PersonRef {
  const user = ctx.usersById.get(id)
  return { id, name: user?.name ?? 'Unknown person', position: user?.position ?? null }
}

export function departmentLabel(ctx: KpiContext, key: string): string {
  const ownerId = ctx.scope.departmentOwners.get(key)?.[0]
  return (ownerId && ctx.usersById.get(ownerId)?.department?.trim()) || key
}

export const byName = (a: PersonRef, b: PersonRef): number => a.name.localeCompare(b.name)
