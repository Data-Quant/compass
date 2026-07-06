import { prisma } from '@/lib/db'
import { isEligibleEmployee } from '@/lib/self-evaluation'

export interface SelfEvalCandidate {
  id: string
  name: string
  email: string | null
  department: string | null
  position: string | null
  role: string
  /** Pre-checked in the send dialog. Regular employees are; functional-role staff are opt-in. */
  autoSelect: boolean
}

/**
 * Self-evaluation recipients: users of any login role who are not a team lead of anyone and not
 * manager/partner level by position. Regular EMPLOYEE-role users are pre-selected in the trigger
 * dialog; functional-role staff (HR, OA, Security, Execution) appear too but unchecked, so HR
 * opts them in deliberately. HR can adjust the whole list before sending.
 */
export async function getEligibleCandidates(): Promise<SelfEvalCandidate[]> {
  const [users, leadMappings] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, name: true, email: true, department: true, position: true, role: true },
      orderBy: { name: 'asc' },
    }),
    prisma.evaluatorMapping.findMany({
      where: { relationshipType: 'TEAM_LEAD' },
      select: { evaluatorId: true },
    }),
  ])
  const leads = new Set(leadMappings.map((m) => m.evaluatorId))
  return users
    .filter((u) => isEligibleEmployee({ position: u.position, leadsAnyone: leads.has(u.id) }))
    .map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      department: u.department,
      position: u.position,
      role: u.role,
      autoSelect: u.role === 'EMPLOYEE',
    }))
}
