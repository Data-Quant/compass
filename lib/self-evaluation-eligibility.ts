import { prisma } from '@/lib/db'
import { isEligibleEmployee } from '@/lib/self-evaluation'

export interface SelfEvalCandidate {
  id: string
  name: string
  email: string | null
  department: string | null
  position: string | null
}

/**
 * Auto-selected self-evaluation recipients: active EMPLOYEE-role users who are not a
 * team lead of anyone and not manager/partner level by position. HR can adjust the list
 * in the trigger dialog before sending.
 */
export async function getEligibleCandidates(): Promise<SelfEvalCandidate[]> {
  const [users, leadMappings] = await Promise.all([
    prisma.user.findMany({
      where: { role: 'EMPLOYEE' },
      select: { id: true, name: true, email: true, department: true, position: true },
      orderBy: { name: 'asc' },
    }),
    prisma.evaluatorMapping.findMany({
      where: { relationshipType: 'TEAM_LEAD' },
      select: { evaluatorId: true },
    }),
  ])
  const leads = new Set(leadMappings.map((m) => m.evaluatorId))
  return users.filter((u) =>
    isEligibleEmployee({ role: 'EMPLOYEE', position: u.position, leadsAnyone: leads.has(u.id) }),
  )
}
