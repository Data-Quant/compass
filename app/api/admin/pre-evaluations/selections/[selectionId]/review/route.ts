import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'

const reviewSchema = z.object({
  reviewStatus: z.enum(['APPROVED', 'REJECTED']),
  reviewNote: z.string().trim().max(1000).optional(),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ selectionId: string }> }
) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { selectionId } = await params
    const body = await request.json()
    const parsed = reviewSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const selection = await prisma.preEvaluationEvaluateeSelection.findUnique({
      where: { id: selectionId },
      select: { id: true },
    })

    if (!selection) {
      return NextResponse.json({ error: 'Selection not found' }, { status: 404 })
    }

    const updated = await prisma.preEvaluationEvaluateeSelection.update({
      where: { id: selectionId },
      data: {
        reviewStatus: parsed.data.reviewStatus,
        reviewNote: parsed.data.reviewNote || null,
        reviewedById: user.id,
        reviewedAt: new Date(),
      },
      include: {
        reviewedBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    return NextResponse.json({ success: true, selection: updated })
  } catch (error) {
    console.error('Failed to review pre-evaluation selection:', error)
    return NextResponse.json(
      { error: 'Failed to review pre-evaluation selection' },
      { status: 500 }
    )
  }
}
