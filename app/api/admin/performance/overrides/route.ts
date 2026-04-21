import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getResolvedEvaluationAssignments } from '@/lib/evaluation-assignments'
import { isAdminRole } from '@/lib/permissions'
import { stripHtmlOptional } from '@/lib/sanitize'
import { isThreeEDepartment } from '@/lib/company-branding'

const relationshipTypeSchema = z.enum([
  'DIRECT_REPORT',
  'TEAM_LEAD',
  'PEER',
  'C_LEVEL',
  'HR',
  'DEPT',
  'CROSS_DEPARTMENT',
])

const createOverrideSchema = z.object({
  periodId: z.string().trim().optional(),
  evaluatorId: z.string().trim().min(1),
  evaluateeId: z.string().trim().min(1),
  relationshipType: relationshipTypeSchema,
  action: z.enum(['ADD', 'REMOVE']),
  note: z.string().trim().max(1000).optional().nullable(),
})

async function resolveTargetPeriod(periodId?: string | null) {
  if (periodId) {
    return prisma.evaluationPeriod.findUnique({
      where: { id: periodId },
      select: { id: true, name: true, isActive: true },
    })
  }

  return prisma.evaluationPeriod.findFirst({
    where: { isActive: true },
    select: { id: true, name: true, isActive: true },
  })
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = createOverrideSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid override payload' }, { status: 400 })
    }

    const { evaluatorId, evaluateeId, relationshipType, action } = parsed.data
    if (evaluatorId === evaluateeId) {
      return NextResponse.json(
        { error: 'Evaluator and evaluatee must be different people' },
        { status: 400 }
      )
    }

    const period = await resolveTargetPeriod(parsed.data.periodId)
    if (!period) {
      return NextResponse.json({ error: 'Evaluation period not found' }, { status: 404 })
    }

    const [evaluator, evaluatee] = await Promise.all([
      prisma.user.findUnique({
        where: { id: evaluatorId },
        select: { id: true, name: true, department: true, position: true },
      }),
      prisma.user.findUnique({
        where: { id: evaluateeId },
        select: { id: true, name: true, department: true, position: true },
      }),
    ])

    if (!evaluator || !evaluatee) {
      return NextResponse.json({ error: 'Evaluator or evaluatee not found' }, { status: 404 })
    }

    if (isThreeEDepartment(evaluator.department) || isThreeEDepartment(evaluatee.department)) {
      return NextResponse.json(
        { error: '3E employees are not part of the evaluation period override flow' },
        { status: 400 }
      )
    }

    const note = stripHtmlOptional(parsed.data.note?.trim() || null)

    const override = await prisma.$transaction(async (tx) => {
      const existingOverride = await tx.evaluationPeriodAssignmentOverride.findUnique({
        where: {
          periodId_evaluatorId_evaluateeId_relationshipType: {
            periodId: period.id,
            evaluatorId,
            evaluateeId,
            relationshipType,
          },
        },
      })

      const resolvedAssignments = await getResolvedEvaluationAssignments(period.id, {
        evaluatorId,
        evaluateeId,
        db: tx,
      })
      const isCurrentlyActive = resolvedAssignments.some(
        (assignment) => assignment.relationshipType === relationshipType
      )

      if (action === 'ADD' && isCurrentlyActive && !existingOverride) {
        throw new Error('This evaluator relationship is already active for the selected period')
      }

      if (action === 'REMOVE' && !isCurrentlyActive && !existingOverride) {
        throw new Error('This evaluator relationship is not currently active in the selected period')
      }

      return tx.evaluationPeriodAssignmentOverride.upsert({
        where: {
          periodId_evaluatorId_evaluateeId_relationshipType: {
            periodId: period.id,
            evaluatorId,
            evaluateeId,
            relationshipType,
          },
        },
        update: {
          action,
          note,
          createdById: user.id,
        },
        create: {
          periodId: period.id,
          evaluatorId,
          evaluateeId,
          relationshipType,
          action,
          note,
          createdById: user.id,
        },
        include: {
          evaluator: {
            select: { id: true, name: true, department: true, position: true },
          },
          evaluatee: {
            select: { id: true, name: true, department: true, position: true },
          },
          createdBy: {
            select: { id: true, name: true },
          },
        },
      })
    })

    return NextResponse.json({
      override: {
        id: override.id,
        periodId: period.id,
        periodName: period.name,
        action: override.action,
        relationshipType: override.relationshipType,
        note: override.note,
        createdAt: override.createdAt,
        createdBy: override.createdBy,
        evaluator: override.evaluator,
        evaluatee: override.evaluatee,
      },
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to save period override'
    const knownUserErrors = new Set([
      'This evaluator relationship is already active for the selected period',
      'This evaluator relationship is not currently active in the selected period',
    ])
    console.error('Failed to save evaluation period override:', error)
    return NextResponse.json(
      { error: message },
      { status: knownUserErrors.has(message) ? 400 : 500 }
    )
  }
}
