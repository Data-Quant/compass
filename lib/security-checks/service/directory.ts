// Compass employee directory as seen by Security Checks. "Active" follows the
// KPI convention: payroll profile active (or absent) and no past exit date.
import { prisma } from '@/lib/db'
import type { DirectoryPerson } from '../audience'
import type { Db } from './db'

export interface DirectoryEntry extends DirectoryPerson {
  name: string
  email: string | null
  position: string | null
}

export function isActiveEmployee(
  profile: { isPayrollActive: boolean; exitDate: Date | null } | null,
  now: Date,
): boolean {
  if (!profile) return true
  if (!profile.isPayrollActive) return false
  return !profile.exitDate || profile.exitDate.getTime() > now.getTime()
}

export async function loadDirectory(db: Db = prisma, now: Date = new Date()): Promise<DirectoryEntry[]> {
  const users = await db.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      position: true,
      department: true,
      teamTag: true,
      payrollProfile: { select: { isPayrollActive: true, exitDate: true } },
    },
    orderBy: { name: 'asc' },
  })
  return users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    position: user.position,
    department: user.department,
    teamTag: user.teamTag,
    active: isActiveEmployee(user.payrollProfile, now),
  }))
}

export interface PersonSummary {
  id: string
  name: string
  department: string | null
}

export async function peopleById(ids: readonly string[], db: Db = prisma): Promise<Map<string, PersonSummary>> {
  const unique = [...new Set(ids)].filter(Boolean)
  if (unique.length === 0) return new Map()
  const users = await db.user.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, department: true } })
  return new Map(users.map((user) => [user.id, user]))
}

export function personOrUnknown(map: ReadonlyMap<string, PersonSummary>, id: string | null): PersonSummary | null {
  if (!id) return null
  return map.get(id) ?? { id, name: 'Unknown person', department: null }
}
