import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManageOnboarding } from '@/lib/permissions'

function parseRequiredDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export async function GET() {
  try {
    const user = await getSession()
    if (!user || !canManageOnboarding(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const newHires = await prisma.newHire.findMany({
      include: {
        position: true,
        teamLead: { select: { id: true, name: true, email: true } },
        buddy: { select: { id: true, name: true, email: true } },
        user: { select: { id: true, name: true, email: true, onboardingCompleted: true } },
        teamLeadForm: true,
        securityChecklist: true,
      },
      orderBy: [{ status: 'asc' }, { onboardingDate: 'desc' }],
    })

    return NextResponse.json({ newHires })
  } catch (error) {
    console.error('Failed to fetch new hires:', error)
    return NextResponse.json({ error: 'Failed to fetch new hires' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !canManageOnboarding(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const positionId = typeof body.positionId === 'string' ? body.positionId : ''
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    const company = typeof body.company === 'string' ? body.company.trim() : ''
    const department = typeof body.department === 'string' ? body.department.trim() : ''
    const teamLeadId = typeof body.teamLeadId === 'string' ? body.teamLeadId : null
    const email = typeof body.email === 'string' ? body.email.trim() : ''
    const buddyId = typeof body.buddyId === 'string' ? body.buddyId : null
    const onboardingDate = parseRequiredDate(body.onboardingDate)

    if (!positionId || !name || !title || !email || !onboardingDate) {
      return NextResponse.json(
        { error: 'positionId, name, title, email, and onboardingDate are required' },
        { status: 400 }
      )
    }

    const position = await prisma.position.findUnique({
      where: { id: positionId },
      select: { id: true, status: true, teamLeadId: true },
    })
    if (!position) {
      return NextResponse.json({ error: 'Position not found' }, { status: 404 })
    }
    if (position.status !== 'CLOSED') {
      return NextResponse.json(
        { error: 'Only closed positions can be converted to new hires' },
        { status: 400 }
      )
    }

    const existing = await prisma.newHire.findUnique({
      where: { positionId },
      select: { id: true },
    })
    if (existing) {
      return NextResponse.json(
        { error: 'This position is already linked to a new hire' },
        { status: 400 }
      )
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

    const created = await prisma.$transaction(async (tx) => {
      const newHire = await tx.newHire.create({
        data: {
          positionId,
          name,
          title,
          company: company || null,
          department: department || null,
          teamLeadId: teamLeadId || position.teamLeadId || null,
          email,
          onboardingDate,
          buddyId,
          status: 'PENDING',
        },
      })

      await tx.teamLeadForm.create({
        data: {
          newHireId: newHire.id,
        },
      })

      await tx.securityChecklist.create({
        data: {
          newHireId: newHire.id,
        },
      })

      return tx.newHire.findUnique({
        where: { id: newHire.id },
        include: {
          position: true,
          teamLead: { select: { id: true, name: true, email: true } },
          buddy: { select: { id: true, name: true, email: true } },
          teamLeadForm: true,
          securityChecklist: true,
        },
      })
    })

    return NextResponse.json({ success: true, newHire: created })
  } catch (error) {
    console.error('Failed to create new hire:', error)
    return NextResponse.json({ error: 'Failed to create new hire' }, { status: 500 })
  }
}
