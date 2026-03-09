import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'

const overrideSchema = z.object({
  note: z.string().trim().max(1000).optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ prepId: string }> }
) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { prepId } = await params
    const body = await request.json().catch(() => ({}))
    const parsed = overrideSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const prep = await prisma.preEvaluationLeadPrep.findUnique({
      where: { id: prepId },
      include: {
        period: {
          select: {
            reviewStartDate: true,
          },
        },
      },
    })

    if (!prep) {
      return NextResponse.json({ error: 'Pre-evaluation prep not found' }, { status: 404 })
    }

    const reviewStartDate = new Date(prep.period.reviewStartDate)
    reviewStartDate.setHours(0, 0, 0, 0)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (reviewStartDate > today) {
      return NextResponse.json(
        { error: 'Overrides are only available after evaluations begin' },
        { status: 400 }
      )
    }

    const updated = await prisma.preEvaluationLeadPrep.update({
      where: { id: prepId },
      data: {
        overdueAt: prep.overdueAt || new Date(),
        overriddenAt: new Date(),
        overriddenById: user.id,
        overrideNote: parsed.data.note || null,
        status: 'OVERRIDDEN',
      },
    })

    return NextResponse.json({ success: true, prep: updated })
  } catch (error) {
    console.error('Failed to override pre-evaluation prep:', error)
    return NextResponse.json(
      { error: 'Failed to override pre-evaluation prep' },
      { status: 500 }
    )
  }
}
