// §2/§13 Console Admin: explicit per-user, read-only grant by a Security Admin (logged).
import { prisma } from '@/lib/db'
import { canManageConsoleGrants, type SecurityActor } from '../access'
import { actorEntry, requireCapability } from './actor'
import { appendAudit } from './audit'
import { type Db, inTransaction } from './db'
import { conflict, notFound } from './errors'

export interface ConsoleGrantView {
  userId: string
  name: string
  department: string | null
  role: string
  grantedAt: string
  grantedById: string
}

export async function listConsoleGrants(actor: SecurityActor, db: Db = prisma): Promise<ConsoleGrantView[]> {
  requireCapability(canManageConsoleGrants(actor), 'Only Security Admins manage Console Admin access')
  const grants = await db.securityConsoleGrant.findMany({ orderBy: { createdAt: 'asc' } })
  const users = await db.user.findMany({
    where: { id: { in: grants.map((grant) => grant.userId) } },
    select: { id: true, name: true, department: true, role: true },
  })
  const byId = new Map(users.map((user) => [user.id, user]))
  return grants.map((grant) => ({
    userId: grant.userId,
    name: byId.get(grant.userId)?.name ?? 'Unknown person',
    department: byId.get(grant.userId)?.department ?? null,
    role: byId.get(grant.userId)?.role ?? 'EMPLOYEE',
    grantedAt: grant.createdAt.toISOString(),
    grantedById: grant.grantedById,
  }))
}

export async function grantConsoleAdmin(actor: SecurityActor, userId: string, db: Db = prisma): Promise<void> {
  requireCapability(canManageConsoleGrants(actor), 'Only Security Admins manage Console Admin access')
  await inTransaction(db, async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, name: true } })
    if (!user) throw notFound('Person not found')
    const existing = await tx.securityConsoleGrant.findUnique({ where: { userId } })
    if (existing) throw conflict(`${user.name} already has Console Admin access`)
    await tx.securityConsoleGrant.create({ data: { userId, grantedById: actor.id } })
    await appendAudit(tx, actorEntry(actor, 'CONSOLE_ADMIN_GRANTED', 'USER', { targetId: userId, details: { name: user.name } }))
  })
}

export async function revokeConsoleAdmin(actor: SecurityActor, userId: string, db: Db = prisma): Promise<void> {
  requireCapability(canManageConsoleGrants(actor), 'Only Security Admins manage Console Admin access')
  await inTransaction(db, async (tx) => {
    const result = await tx.securityConsoleGrant.deleteMany({ where: { userId } })
    if (result.count === 0) throw notFound('That person does not have Console Admin access')
    await appendAudit(tx, actorEntry(actor, 'CONSOLE_ADMIN_REVOKED', 'USER', { targetId: userId }))
  })
}
