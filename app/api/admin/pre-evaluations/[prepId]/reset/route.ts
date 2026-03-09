import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'

const resetSchema = z.object({
  note: z.string().max(1000).optional(),
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
    const parsed = resetSchema.safeParse(body)
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
            startDate: true,
          },
        },
      },
    })

    if (!prep) {
      return NextResponse.json({ error: 'Pre-evaluation prep not found' }, { status: 404 })
    }

    const now = new Date()
    const periodStart = new Date(prep.period.startDate)
    periodStart.setHours(0, 0, 0, 0)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (periodStart <= today) {
      return NextResponse.json(
        { error: 'Pre-evaluation tasks cannot be reset after the cycle start date' },
        { status: 400 }
      )
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.preEvaluationEvaluateeSelection.updateMany({
        where: { prepId },
        data: {
          reviewStatus: 'PENDING',
          reviewedAt: null,
          reviewedById: null,
          reviewNote: null,
        },
      })

      return tx.preEvaluationLeadPrep.update({
        where: { id: prepId },
        data: {
          questionsSubmittedAt: null,
          evaluateesSubmittedAt: null,
          completedAt: null,
          overdueAt: null,
          overriddenAt: null,
          overriddenById: null,
          overrideNote: null,
          lastResetAt: now,
          resetById: user.id,
          resetNote: parsed.data.note?.trim() || null,
          status: 'PENDING',
        },
      })
    })

    return NextResponse.json({ success: true, prep: updated })
  } catch (error) {
    console.error('Failed to reset pre-evaluation prep:', error)
    return NextResponse.json(
      { error: 'Failed to reset pre-evaluation prep' },
      { status: 500 }
    )
  }
}
