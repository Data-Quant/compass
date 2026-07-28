import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { decideEdit, applyEdit } from '@/lib/evaluation-edit'

/**
 * HR corrections to submitted evaluations.
 *
 * A submitted evaluation is locked for its author, so without this a mis-clicked
 * rating could not be fixed by anyone. Every change writes an EvaluationEdit row
 * holding the previous value, because these scores feed the reports employees
 * receive and a silently altered rating would be impossible to account for later.
 *
 * Reports and the admin scores list both recompute from evaluations on read, so a
 * correction shows up immediately with no cache to invalidate.
 */

const patchSchema = z
  .object({
    evaluationId: z.string().trim().min(1),
    ratingValue: z.number().nullable().optional(),
    textResponse: z.string().nullable().optional(),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((data) => data.ratingValue !== undefined || data.textResponse !== undefined, {
    message: 'Provide a rating or a comment to change',
  })

export async function PATCH(request: NextRequest) {
  try {
    const user = await getSession()
    // HR only. canManagePayroll would also admit O&A, who have no business
    // rewriting what one colleague said about another.
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = patchSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error.errors }, { status: 400 })
    }

    const evaluation = await prisma.evaluation.findUnique({
      where: { id: parsed.data.evaluationId },
      select: {
        id: true,
        periodId: true,
        ratingValue: true,
        textResponse: true,
        submittedAt: true,
      },
    })

    if (!evaluation) {
      return NextResponse.json({ error: 'Evaluation not found' }, { status: 404 })
    }

    const activePeriod = await prisma.evaluationPeriod.findFirst({
      where: { isActive: true },
      select: { id: true },
    })

    const decision = decideEdit({
      target: evaluation,
      input: { ratingValue: parsed.data.ratingValue, textResponse: parsed.data.textResponse },
      activePeriodId: activePeriod?.id ?? null,
    })

    if (!decision.ok) {
      return NextResponse.json({ error: decision.reason }, { status: 400 })
    }

    const next = applyEdit(evaluation, {
      ratingValue: parsed.data.ratingValue,
      textResponse: parsed.data.textResponse,
    })

    // The update and its audit row go together: a correction that survived while
    // its history was lost would be worse than no correction at all.
    const [updated] = await prisma.$transaction([
      prisma.evaluation.update({
        where: { id: evaluation.id },
        data: { ratingValue: next.ratingValue, textResponse: next.textResponse },
      }),
      prisma.evaluationEdit.create({
        data: {
          evaluationId: evaluation.id,
          editedById: user.id,
          previousRating: evaluation.ratingValue,
          newRating: next.ratingValue,
          previousText: evaluation.textResponse,
          newText: next.textResponse,
          reason: parsed.data.reason || null,
        },
      }),
    ])

    return NextResponse.json({ success: true, evaluation: updated })
  } catch (error) {
    console.error('Failed to correct evaluation:', error)
    return NextResponse.json({ error: 'Failed to correct evaluation' }, { status: 500 })
  }
}

// GET - the correction history for one evaluation, so a changed score can be
// explained without going to the database.
export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const evaluationId = searchParams.get('evaluationId')
    if (!evaluationId) {
      return NextResponse.json({ error: 'evaluationId is required' }, { status: 400 })
    }

    const edits = await prisma.evaluationEdit.findMany({
      where: { evaluationId },
      include: { editedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ edits })
  } catch (error) {
    console.error('Failed to load evaluation edit history:', error)
    return NextResponse.json({ error: 'Failed to load evaluation edit history' }, { status: 500 })
  }
}
