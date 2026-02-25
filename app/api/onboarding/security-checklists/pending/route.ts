import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canCompleteSecurityChecklist } from '@/lib/permissions'

export async function GET() {
  try {
    const user = await getSession()
    if (!user || !canCompleteSecurityChecklist(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const pending = await prisma.newHire.findMany({
      where: {
        securityChecklist: {
          is: {
            completedAt: null,
          },
        },
      },
      select: {
        id: true,
        name: true,
        title: true,
        department: true,
        onboardingDate: true,
        securityChecklist: {
          select: {
            equipmentReady: true,
            equipmentReceived: true,
            securityOnboarding: true,
            addedToEmailGroups: true,
            discordSetup: true,
            completedAt: true,
          },
        },
      },
      orderBy: { onboardingDate: 'asc' },
    })

    return NextResponse.json({ pending })
  } catch (error) {
    console.error('Failed to fetch pending security checklists:', error)
    return NextResponse.json({ error: 'Failed to fetch pending security checklists' }, { status: 500 })
  }
}
