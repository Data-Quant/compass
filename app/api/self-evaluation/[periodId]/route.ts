import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { buildSnapshot, validateAnswers } from '@/lib/self-evaluation'

async function loadActiveQuestions() {
  return prisma.selfEvaluationQuestion.findMany({
    where: { isActive: true },
    orderBy: { orderIndex: 'asc' },
  })
}

// GET - the caller's self-evaluation for this period + the active question bank
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ periodId: string }> }
) {
  const user = await getSession()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { periodId } = await params
  const [selfEvaluation, questions] = await Promise.all([
    prisma.selfEvaluation.findUnique({
      where: { periodId_employeeId: { periodId, employeeId: user.id } },
      include: { period: { select: { isLocked: true } } },
    }),
    loadActiveQuestions(),
  ])
  if (!selfEvaluation) {
    return NextResponse.json(
      { error: 'No self-evaluation assigned for this period' },
      { status: 404 }
    )
  }
  return NextResponse.json({
    selfEvaluation: {
      id: selfEvaluation.id,
      status: selfEvaluation.status,
      answers: selfEvaluation.answers,
      submittedAt: selfEvaluation.submittedAt,
    },
    locked: selfEvaluation.period.isLocked,
    questions,
  })
}

// PUT - save draft or submit
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ periodId: string }> }
) {
  const user = await getSession()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { periodId } = await params
  const { answers, submit } = await request.json()

  const current = await prisma.selfEvaluation.findUnique({
    where: { periodId_employeeId: { periodId, employeeId: user.id } },
    include: { period: { select: { isLocked: true } } },
  })
  if (!current) {
    return NextResponse.json(
      { error: 'No self-evaluation assigned for this period' },
      { status: 404 }
    )
  }
  if (current.period.isLocked) {
    return NextResponse.json(
      { error: 'This evaluation period is locked. Submissions are no longer accepted.' },
      { status: 403 }
    )
  }
  if (current.status === 'SUBMITTED') {
    return NextResponse.json({ error: 'Self-evaluation already submitted' }, { status: 400 })
  }

  const questions = await loadActiveQuestions()
  let saved
  try {
    saved = submit ? buildSnapshot(questions, answers || []) : validateAnswers(questions, answers || [])
  } catch {
    return NextResponse.json({ error: 'Invalid answer format' }, { status: 400 })
  }

  const updated = await prisma.selfEvaluation.update({
    where: { id: current.id },
    data: {
      answers: saved as unknown as Prisma.InputJsonValue,
      startedAt: current.startedAt || new Date(),
      ...(submit ? { status: 'SUBMITTED' as const, submittedAt: new Date() } : {}),
    },
  })

  return NextResponse.json({ success: true, status: updated.status })
}
