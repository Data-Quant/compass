import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { validateTransitionTasks, canSubmitTransitionPlan } from '@/lib/leave-transition-plan'
import { sendTransitionPlanSubmittedNotification } from '@/lib/email'

async function loadOwnedRequest(id: string, userId: string, isAdmin: boolean) {
  const leaveRequest = await prisma.leaveRequest.findUnique({ where: { id } })
  if (!leaveRequest) return { error: 'Leave request not found', status: 404 as const }
  if (leaveRequest.employeeId !== userId && !isAdmin) {
    return { error: 'Not authorized', status: 403 as const }
  }
  return { leaveRequest }
}

// GET - the request's transition plan
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const loaded = await loadOwnedRequest(id, user.id, isAdminRole(user.role))
  if ('error' in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status })
  const r = loaded.leaveRequest
  return NextResponse.json({
    tasks: r.transitionPlanTasks ?? [],
    submittedAt: r.transitionPlanSubmittedAt,
    leadStatus: r.transitionPlanLeadStatus,
    disapprovalReason: r.transitionPlanDisapprovalReason,
    hrRepresentative: r.hrRepresentative,
    generalNotes: r.transitionPlan,
  })
}

// PUT - save a draft (no submit)
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const loaded = await loadOwnedRequest(id, user.id, isAdminRole(user.role))
  if ('error' in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status })

  const body = await request.json().catch(() => ({}))
  let tasks
  try {
    tasks = validateTransitionTasks(body.tasks)
  } catch {
    return NextResponse.json({ error: 'Invalid transition plan tasks' }, { status: 400 })
  }
  try {
    await prisma.leaveRequest.update({
      where: { id },
      data: {
        transitionPlanTasks: tasks as unknown as Prisma.InputJsonValue,
        ...(body.hrRepresentative !== undefined
          ? { hrRepresentative: String(body.hrRepresentative).trim() || null }
          : {}),
        ...(body.generalNotes !== undefined ? { transitionPlan: String(body.generalNotes).trim() } : {}),
      },
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return NextResponse.json({ error: 'Leave request not found' }, { status: 404 })
    }
    throw err
  }
}

// POST - submit the transition plan (notifies the team lead)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const loaded = await loadOwnedRequest(id, user.id, isAdminRole(user.role))
  if ('error' in loaded) return NextResponse.json({ error: loaded.error }, { status: loaded.status })

  const body = await request.json().catch(() => ({}))
  // Prefer freshly-provided tasks; otherwise submit whatever is already stored.
  let tasks
  try {
    tasks = body.tasks !== undefined
      ? validateTransitionTasks(body.tasks)
      : validateTransitionTasks(loaded.leaveRequest.transitionPlanTasks)
  } catch {
    return NextResponse.json({ error: 'Invalid transition plan tasks' }, { status: 400 })
  }
  if (!canSubmitTransitionPlan(tasks)) {
    return NextResponse.json({ error: 'Add at least one task before submitting' }, { status: 400 })
  }

  try {
    await prisma.leaveRequest.update({
      where: { id },
      data: {
        transitionPlanTasks: tasks as unknown as Prisma.InputJsonValue,
        transitionPlanSubmittedAt: new Date(),
        transitionPlanLeadStatus: 'PENDING',
        transitionPlanLeadReviewedAt: null,
        transitionPlanLeadReviewedById: null,
        transitionPlanDisapprovalReason: null,
        ...(body.hrRepresentative !== undefined
          ? { hrRepresentative: String(body.hrRepresentative).trim() || null }
          : {}),
        ...(body.generalNotes !== undefined ? { transitionPlan: String(body.generalNotes).trim() } : {}),
      },
    })
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      return NextResponse.json({ error: 'Leave request not found' }, { status: 404 })
    }
    throw err
  }

  try {
    await sendTransitionPlanSubmittedNotification(id)
  } catch (err) {
    console.error('Transition plan submitted notification failed:', err)
  }

  return NextResponse.json({ success: true })
}
