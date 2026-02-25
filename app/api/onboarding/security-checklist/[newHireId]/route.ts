import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canCompleteSecurityChecklist } from '@/lib/permissions'
import { sendSecurityChecklistCompleteNotification } from '@/lib/email'

interface RouteContext {
  params: Promise<{ newHireId: string }>
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const user = await getSession()
    if (!user || !canCompleteSecurityChecklist(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { newHireId } = await context.params
    const record = await prisma.newHire.findUnique({
      where: { id: newHireId },
      include: {
        securityChecklist: true,
        teamLead: { select: { id: true, name: true, email: true } },
      },
    })

    if (!record || !record.securityChecklist) {
      return NextResponse.json({ error: 'Security checklist not found' }, { status: 404 })
    }

    return NextResponse.json({
      newHire: {
        id: record.id,
        name: record.name,
        title: record.title,
        department: record.department,
        teamLead: record.teamLead,
      },
      checklist: record.securityChecklist,
    })
  } catch (error) {
    console.error('Failed to fetch security checklist:', error)
    return NextResponse.json({ error: 'Failed to fetch security checklist' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSession()
    if (!user || !canCompleteSecurityChecklist(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { newHireId } = await context.params
    const existing = await prisma.securityChecklist.findUnique({
      where: { newHireId },
      select: { id: true, completedAt: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Security checklist not found' }, { status: 404 })
    }

    const body = await request.json()
    const patch: {
      equipmentReady?: boolean
      equipmentReceived?: boolean
      securityOnboarding?: boolean
      addedToEmailGroups?: boolean
      discordSetup?: boolean
    } = {}

    if (typeof body.equipmentReady === 'boolean') patch.equipmentReady = body.equipmentReady
    if (typeof body.equipmentReceived === 'boolean') patch.equipmentReceived = body.equipmentReceived
    if (typeof body.securityOnboarding === 'boolean') patch.securityOnboarding = body.securityOnboarding
    if (typeof body.addedToEmailGroups === 'boolean') patch.addedToEmailGroups = body.addedToEmailGroups
    if (typeof body.discordSetup === 'boolean') patch.discordSetup = body.discordSetup

    const merged = await prisma.securityChecklist.update({
      where: { newHireId },
      data: patch,
    })

    const isComplete =
      merged.equipmentReady &&
      merged.equipmentReceived &&
      merged.securityOnboarding &&
      merged.addedToEmailGroups &&
      merged.discordSetup

    const updated = await prisma.securityChecklist.update({
      where: { newHireId },
      data: {
        completedAt: isComplete ? merged.completedAt ?? new Date() : null,
      },
    })

    if (isComplete && !existing.completedAt) {
      try {
        await sendSecurityChecklistCompleteNotification(newHireId)
      } catch (emailError) {
        console.error('Failed to send security checklist complete notification:', emailError)
      }
    }

    return NextResponse.json({ success: true, checklist: updated })
  } catch (error) {
    console.error('Failed to update security checklist:', error)
    return NextResponse.json({ error: 'Failed to update security checklist' }, { status: 500 })
  }
}
