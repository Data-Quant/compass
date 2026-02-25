import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!user.isTeamLead) {
      return NextResponse.json({ pending: [] })
    }

    const pending = await prisma.newHire.findMany({
      where: {
        teamLeadId: user.id,
        teamLeadForm: {
          is: {
            submittedAt: null,
          },
        },
      },
      select: {
        id: true,
        name: true,
        title: true,
        department: true,
        onboardingDate: true,
        teamLeadForm: {
          select: {
            submittedAt: true,
          },
        },
      },
      orderBy: { onboardingDate: 'asc' },
    })

    return NextResponse.json({ pending })
  } catch (error) {
    console.error('Failed to fetch pending team lead forms:', error)
    return NextResponse.json({ error: 'Failed to fetch pending team lead forms' }, { status: 500 })
  }
}
