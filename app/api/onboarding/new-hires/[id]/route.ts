import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManageOnboarding } from '@/lib/permissions'
import { sendTeamLeadFormRequestNotification } from '@/lib/email'

interface RouteContext {
  params: Promise<{ id: string }>
}

function parseOptionalDate(value: unknown): Date | undefined {
  if (!value || typeof value !== 'string') return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const user = await getSession()
    if (!user || !canManageOnboarding(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    const newHire = await prisma.newHire.findUnique({
      where: { id },
      include: {
        position: true,
        teamLead: { select: { id: true, name: true, email: true } },
        buddy: { select: { id: true, name: true, email: true } },
        user: { select: { id: true, name: true, email: true, onboardingCompleted: true } },
        teamLeadForm: true,
        securityChecklist: true,
      },
    })

    if (!newHire) {
      return NextResponse.json({ error: 'New hire not found' }, { status: 404 })
    }

    return NextResponse.json({ newHire })
  } catch (error) {
    console.error('Failed to fetch new hire:', error)
    return NextResponse.json({ error: 'Failed to fetch new hire' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSession()
    if (!user || !canManageOnboarding(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    const body = await request.json()

    const existing = await prisma.newHire.findUnique({
      where: { id },
      select: { id: true, teamLeadId: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'New hire not found' }, { status: 404 })
    }

    const name = typeof body.name === 'string' ? body.name.trim() : undefined
    const title = typeof body.title === 'string' ? body.title.trim() : undefined
    const company = typeof body.company === 'string' ? body.company.trim() : undefined
    const department = typeof body.department === 'string' ? body.department.trim() : undefined
    const teamLeadId = typeof body.teamLeadId === 'string' ? body.teamLeadId : body.teamLeadId === null ? null : undefined
    const email = typeof body.email === 'string' ? body.email.trim() : undefined
    const onboardingDate =
      body.onboardingDate !== undefined ? parseOptionalDate(body.onboardingDate) : undefined
    const buddyId = typeof body.buddyId === 'string' ? body.buddyId : body.buddyId === null ? null : undefined
    const status = typeof body.status === 'string' ? body.status.toUpperCase() : undefined

    if (status && !['PENDING', 'ONBOARDING', 'COMPLETED'].includes(status)) {
      return NextResponse.json({ error: 'Invalid new hire status' }, { status: 400 })
    }

    if (teamLeadId) {
      const lead = await prisma.user.findUnique({ where: { id: teamLeadId }, select: { id: true } })
      if (!lead) {
        return NextResponse.json({ error: 'Invalid team lead' }, { status: 400 })
      }
    }

    if (buddyId) {
      const buddy = await prisma.user.findUnique({ where: { id: buddyId }, select: { id: true } })
      if (!buddy) {
        return NextResponse.json({ error: 'Invalid buddy' }, { status: 400 })
      }
    }

    const updated = await prisma.newHire.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(title !== undefined ? { title } : {}),
        ...(company !== undefined ? { company: company || null } : {}),
        ...(department !== undefined ? { department: department || null } : {}),
        ...(teamLeadId !== undefined ? { teamLeadId } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(onboardingDate !== undefined ? { onboardingDate } : {}),
        ...(buddyId !== undefined ? { buddyId } : {}),
        ...(status ? { status: status as 'PENDING' | 'ONBOARDING' | 'COMPLETED' } : {}),
      },
      include: {
        position: true,
        teamLead: { select: { id: true, name: true, email: true } },
        buddy: { select: { id: true, name: true, email: true } },
        user: { select: { id: true, name: true, email: true, onboardingCompleted: true } },
        teamLeadForm: true,
        securityChecklist: true,
      },
    })

    if (teamLeadId !== undefined && teamLeadId !== null && teamLeadId !== existing.teamLeadId) {
      try {
        await sendTeamLeadFormRequestNotification(id)
      } catch (emailError) {
        console.error('Failed to send team lead form request notification:', emailError)
      }
    }

    return NextResponse.json({ success: true, newHire: updated })
  } catch (error) {
    console.error('Failed to update new hire:', error)
    return NextResponse.json({ error: 'Failed to update new hire' }, { status: 500 })
  }
}
