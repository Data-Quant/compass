import type { SafeUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import type { PersonFacts } from '../eligibility'
import type { PersonRef } from '../view-types'
import type { Db } from './db'
import { WeeklyError } from './errors'

export interface WeeklyActor {
  id: string
  name: string
  role: SafeUser['role']
  position: string | null
  department: string | null
}

export function actorFromUser(user: Pick<SafeUser, 'id' | 'name' | 'role' | 'position' | 'department'>): WeeklyActor {
  return { id: user.id, name: user.name, role: user.role, position: user.position, department: user.department }
}

export function isHrActor(actor: Pick<WeeklyActor, 'role'>): boolean {
  return actor.role === 'HR'
}

export function assertHr(actor: Pick<WeeklyActor, 'role'>): void {
  if (!isHrActor(actor)) throw new WeeklyError('HR access required', 403)
}

/** Users with their payroll facts; people without a payroll profile count as active. */
export async function loadPeople(ids: Iterable<string>, db: Db = prisma): Promise<Map<string, PersonFacts>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()
  const users = await db.user.findMany({
    where: { id: { in: unique } },
    select: {
      id: true, name: true, department: true, position: true,
      payrollProfile: { select: { isPayrollActive: true, exitDate: true, joiningDate: true } },
    },
  })
  return new Map(
    users.map((user) => [
      user.id,
      {
        id: user.id, name: user.name, department: user.department, position: user.position,
        payrollActive: user.payrollProfile?.isPayrollActive ?? true,
        exitDate: user.payrollProfile?.exitDate ?? null,
        joiningDate: user.payrollProfile?.joiningDate ?? null,
      },
    ]),
  )
}

export function personRef(people: ReadonlyMap<string, Pick<PersonFacts, 'name' | 'position'>>, id: string): PersonRef {
  const person = people.get(id)
  return { id, name: person?.name ?? 'Unknown person', position: person?.position ?? null }
}

export const byName = (a: PersonRef, b: PersonRef): number => a.name.localeCompare(b.name)
