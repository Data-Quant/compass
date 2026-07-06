import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { sendTransitionPlanDisapprovedNotification } from '@/lib/email'

// POST - team lead approves or disapproves a submitted transition plan.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const leaveRequest = await prisma.leaveRequest.findUnique({ where: { id } })
  if (!leaveRequest) return NextResponse.json({ error: 'Leave request not found' }, { status: 404 })

  // Authorization: the applicant's team lead, or HR.
  const isAdmin = isAdminRole(user.role)
  if (!isAdmin) {
    const leadMapping = await prisma.evaluatorMapping.findFirst({
      where: {
        evaluatorId: user.id,
        evaluateeId: leaveRequest.employeeId,
        relationshipType: 'TEAM_LEAD',
      },
      select: { id: true },
    })
    if (!leadMapping) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  if (!leaveRequest.transitionPlanSubmittedAt) {
    return NextResponse.json({ error: 'No transition plan has been submitted' }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  const action = body.action
  if (action !== 'APPROVE' && action !== 'DISAPPROVE') {
    return NextResponse.json({ error: 'action must be APPROVE or DISAPPROVE' }, { status: 400 })
  }

  const reason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (action === 'DISAPPROVE' && !reason) {
    return NextResponse.json({ error: 'A reason is required to disapprove' }, { status: 400 })
  }

  try {
    await prisma.leaveRequest.update({
      where: { id },
      data: {
        transitionPlanLeadStatus: action === 'APPROVE' ? 'APPROVED' : 'DISAPPROVED',
        transitionPlanLeadReviewedAt: new Date(),
        transitionPlanLeadReviewedById: user.id,
        transitionPlanDisapprovalReason: action === 'DISAPPROVE' ? reason : null,
      },
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return NextResponse.json({ error: 'Leave request not found' }, { status: 404 })
    }
    throw err
  }

  if (action === 'DISAPPROVE') {
    try {
      await sendTransitionPlanDisapprovedNotification(id, reason)
    } catch (err) {
      console.error('Transition plan disapproved notification failed:', err)
    }
  }

  return NextResponse.json({ success: true, leadStatus: action === 'APPROVE' ? 'APPROVED' : 'DISAPPROVED' })
}
