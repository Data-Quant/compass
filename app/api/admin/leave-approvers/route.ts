import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { isThreeEDepartment } from '@/lib/company-branding'
import {
  createLogicalEvaluatorMapping,
  deleteLogicalEvaluatorMappingById,
} from '@/lib/evaluation-mappings'

/**
 * 3E team lead assignments, used solely to route leave approvals.
 *
 * 3E sits outside evaluations, so its people are barred from the org-wide mapping
 * screens, the org chart, and every evaluation pathway. Leave approval, however,
 * routes entirely on TEAM_LEAD mappings (app/api/leave/*, lib/email.ts), so without
 * a row a 3E lead never receives their team's requests and the leave falls through
 * to HR-only.
 *
 * This endpoint is the one place those reporting lines can be managed. It is
 * deliberately narrow: TEAM_LEAD only, 3E team members only, and always without the
 * DIRECT_REPORT mirror, which would imply an evaluation link. The rows it writes stay
 * invisible to the org-wide mapping list and the org chart, both of which exclude 3E
 * by user, and produce no evaluations, because assignment generation, scoring,
 * reports and analytics each re-check department independently.
 */

type ParticipantShape = {
  id: string
  name: string | null
  email: string | null
  department: string | null
  position: string | null
}

function toParticipant(user: ParticipantShape) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    department: user.department,
    position: user.position,
  }
}

// GET - List every 3E team lead assignment
export async function GET() {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const mappings = await prisma.evaluatorMapping.findMany({
      where: { relationshipType: 'TEAM_LEAD' },
      include: {
        evaluator: { select: { id: true, name: true, email: true, department: true, position: true } },
        evaluatee: { select: { id: true, name: true, email: true, department: true, position: true } },
      },
    })

    // Department is a free-text field, so match it the same way the rest of the app
    // does rather than trusting an exact-string query.
    const assignments = mappings
      .filter((mapping) => isThreeEDepartment(mapping.evaluatee.department))
      .map((mapping) => ({
        id: mapping.id,
        employee: toParticipant(mapping.evaluatee),
        lead: toParticipant(mapping.evaluator),
      }))
      .sort((a, b) => (a.employee.name || '').localeCompare(b.employee.name || ''))

    return NextResponse.json({ assignments })
  } catch (error) {
    console.error('Failed to fetch 3E leave approvers:', error)
    return NextResponse.json({ error: 'Failed to fetch 3E leave approvers' }, { status: 500 })
  }
}

// POST - Assign a team lead to a 3E team member
export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { employeeId, leadId } = await request.json()

    if (!employeeId || !leadId) {
      return NextResponse.json(
        { error: 'Both a 3E team member and a team lead are required' },
        { status: 400 }
      )
    }

    if (employeeId === leadId) {
      return NextResponse.json(
        { error: 'A team member cannot be their own team lead' },
        { status: 400 }
      )
    }

    const participants = await prisma.user.findMany({
      where: { id: { in: [employeeId, leadId] } },
      select: { id: true, name: true, department: true },
    })

    const employee = participants.find((participant) => participant.id === employeeId)
    const lead = participants.find((participant) => participant.id === leadId)

    if (!employee || !lead) {
      return NextResponse.json({ error: 'Team member or team lead not found' }, { status: 404 })
    }

    // The only rows this endpoint may write are reporting lines for 3E team members.
    if (!isThreeEDepartment(employee.department)) {
      return NextResponse.json(
        { error: `${employee.name || 'This person'} is not a 3E team member` },
        { status: 400 }
      )
    }

    const existing = await prisma.evaluatorMapping.findFirst({
      where: { evaluatorId: leadId, evaluateeId: employeeId, relationshipType: 'TEAM_LEAD' },
      select: { id: true },
    })

    if (existing) {
      return NextResponse.json(
        { error: `${lead.name || 'That person'} already leads ${employee.name || 'this team member'}` },
        { status: 409 }
      )
    }

    // skipManagementMirror keeps this to a single TEAM_LEAD row. The mirrored
    // DIRECT_REPORT row exists so a report evaluates their lead, which must not
    // happen for 3E.
    await createLogicalEvaluatorMapping(
      prisma,
      { evaluatorId: leadId, evaluateeId: employeeId, relationshipType: 'TEAM_LEAD' },
      { skipManagementMirror: true }
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to assign 3E team lead:', error)
    return NextResponse.json({ error: 'Failed to assign 3E team lead' }, { status: 500 })
  }
}

// DELETE - Remove a 3E team lead assignment
export async function DELETE(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Assignment id is required' }, { status: 400 })
    }

    const mapping = await prisma.evaluatorMapping.findUnique({
      where: { id },
      include: { evaluatee: { select: { department: true } } },
    })

    if (!mapping) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
    }

    // Guard the scope of this endpoint: it must not become a way to delete org-wide
    // mappings that the evaluation screens own.
    if (mapping.relationshipType !== 'TEAM_LEAD' || !isThreeEDepartment(mapping.evaluatee.department)) {
      return NextResponse.json({ error: 'Not a 3E team lead assignment' }, { status: 400 })
    }

    await deleteLogicalEvaluatorMappingById(prisma, id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to remove 3E team lead:', error)
    return NextResponse.json({ error: 'Failed to remove 3E team lead' }, { status: 500 })
  }
}
