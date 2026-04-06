import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  buildPreEvaluationSelectionKey,
  getCurrentLeadPrep,
  saveDraftSelections,
  syncPrepStatus,
} from '@/lib/pre-evaluation'

const selectionSchema = z.object({
  type: z.enum(['PRIMARY', 'PEER', 'CROSS_DEPARTMENT']),
  evaluateeId: z.string().trim().min(1),
  suggestedEvaluatorId: z.string().trim().min(1).optional().nullable(),
})

const submitSchema = z.object({
  selections: z.array(selectionSchema).min(1),
})

function validateSelections(
  selections: z.infer<typeof selectionSchema>[],
  directReportIds: Set<string>
) {
  const seen = new Set<string>()

  for (const selection of selections) {
    if (selection.type === 'PRIMARY' && selection.suggestedEvaluatorId) {
      return 'Primary selections cannot include a suggested evaluator'
    }
    if ((selection.type === 'CROSS_DEPARTMENT' || selection.type === 'PEER') && !selection.suggestedEvaluatorId) {
      return `${selection.type === 'PEER' ? 'Peer' : 'Cross-department'} selections require a suggested evaluator`
    }
    if (selection.suggestedEvaluatorId && selection.suggestedEvaluatorId === selection.evaluateeId) {
      return 'An employee cannot be assigned to evaluate themselves'
    }
    if (selection.type === 'PEER' && !directReportIds.has(selection.evaluateeId)) {
      return 'Peer evaluator requests are only allowed for your direct reports'
    }

    const key = buildPreEvaluationSelectionKey(
      selection.type,
      selection.evaluateeId,
      selection.suggestedEvaluatorId || null
    )

    if (seen.has(key)) {
      return 'Duplicate evaluatee selections are not allowed'
    }
    seen.add(key)
  }

  return null
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const prep = await getCurrentLeadPrep(user.id)
    if (!prep) {
      return NextResponse.json({ error: 'No active pre-evaluation task found' }, { status: 404 })
    }
    if (!prep.editable) {
      return NextResponse.json(
        { error: 'This pre-evaluation task is no longer editable' },
        { status: 403 }
      )
    }
    if (prep.evaluateesSubmittedAt) {
      return NextResponse.json(
        { error: 'Evaluatee list has already been submitted' },
        { status: 400 }
      )
    }

    const directReportIds = new Set(prep.directReportUsers.map((user) => user.id))

    const body = await request.json()
    const parsed = submitSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'You must submit at least one evaluatee selection', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const validationError = validateSelections(parsed.data.selections, directReportIds)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    await prisma.$transaction(async (tx) => {
      await saveDraftSelections(prep.id, parsed.data.selections, tx)
      await tx.preEvaluationLeadPrep.update({
        where: { id: prep.id },
        data: {
          evaluateesSubmittedAt: new Date(),
        },
      })
    })

    const synced = await syncPrepStatus(prisma, prep.id)
    return NextResponse.json({ success: true, prep: synced })
  } catch (error) {
    console.error('Failed to submit pre-evaluation selections:', error)
    return NextResponse.json(
      { error: 'Failed to submit evaluatee list' },
      { status: 500 }
    )
  }
}
