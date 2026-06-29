import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { getEligibleCandidates } from '@/lib/self-evaluation-eligibility'
import { sendSelfEvaluationInvite } from '@/lib/email'

// GET - recipient preview for a period
export async function GET(request: NextRequest) {
  const user = await getSession()
  if (!user || !isAdminRole(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(request.url)
  const periodId = searchParams.get('periodId')
  if (!periodId) {
    return NextResponse.json({ error: 'periodId is required' }, { status: 400 })
  }
  const [period, candidates, existingCount] = await Promise.all([
    prisma.evaluationPeriod.findUnique({ where: { id: periodId } }),
    getEligibleCandidates(),
    prisma.selfEvaluation.count({ where: { periodId } }),
  ])
  if (!period) {
    return NextResponse.json({ error: 'Period not found' }, { status: 404 })
  }
  return NextResponse.json({
    period: {
      id: period.id,
      name: period.name,
      selfEvaluationTriggeredAt: period.selfEvaluationTriggeredAt,
    },
    candidates,
    alreadyTriggered: Boolean(period.selfEvaluationTriggeredAt),
    existingCount,
  })
}

// POST - create DRAFT self-evaluations for selected employees and email the new ones
export async function POST(request: NextRequest) {
  const user = await getSession()
  if (!user || !isAdminRole(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { periodId, employeeIds } = await request.json()
  if (!periodId || !Array.isArray(employeeIds) || employeeIds.length === 0) {
    return NextResponse.json(
      { error: 'periodId and a non-empty employeeIds[] are required' },
      { status: 400 }
    )
  }
  const period = await prisma.evaluationPeriod.findUnique({ where: { id: periodId } })
  if (!period) {
    return NextResponse.json({ error: 'Period not found' }, { status: 404 })
  }

  // Enforce eligibility server-side: ignore any requested id that is not an eligible
  // employee (managers/leads/partners/HR cannot be assigned a self-evaluation even via a
  // direct API call). The HR dialog can only narrow this set, never widen it.
  const eligible = await getEligibleCandidates()
  const eligibleSet = new Set(eligible.map((c) => c.id))
  const requestedIds: string[] = employeeIds.filter((id: string) => eligibleSet.has(id))

  const existing = await prisma.selfEvaluation.findMany({
    where: { periodId, employeeId: { in: requestedIds } },
    select: { employeeId: true },
  })
  const existingSet = new Set(existing.map((e) => e.employeeId))
  const toCreate: string[] = requestedIds.filter((id) => !existingSet.has(id))

  if (toCreate.length > 0) {
    await prisma.selfEvaluation.createMany({
      data: toCreate.map((employeeId) => ({ periodId, employeeId })),
      skipDuplicates: true,
    })
  }

  await prisma.evaluationPeriod.update({
    where: { id: periodId },
    data: { selfEvaluationTriggeredAt: new Date(), selfEvaluationTriggeredById: user.id },
  })

  // Email only the newly added employees
  const newEmployees = await prisma.user.findMany({
    where: { id: { in: toCreate }, email: { not: null } },
    select: { name: true, email: true },
  })
  let emailed = 0
  for (const e of newEmployees) {
    try {
      await sendSelfEvaluationInvite({ to: e.email!, employeeName: e.name, periodName: period.name })
      emailed++
    } catch (err) {
      console.error('Self-evaluation invite failed for', e.email, err)
    }
  }

  return NextResponse.json({ created: toCreate.length, skipped: existingSet.size, emailed })
}
