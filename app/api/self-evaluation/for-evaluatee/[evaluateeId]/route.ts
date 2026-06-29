import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getResolvedEvaluationAssignmentForPair } from '@/lib/evaluation-assignments'

// GET - an evaluatee's SUBMITTED self-evaluation, for an authorized evaluator only.
// Never returns drafts.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ evaluateeId: string }> }
) {
  const user = await getSession()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(request.url)
  const periodId = searchParams.get('periodId')
  if (!periodId) {
    return NextResponse.json({ error: 'periodId is required' }, { status: 400 })
  }
  const { evaluateeId } = await params

  // Authorization: only the evaluatee's TEAM LEAD may view the self-evaluation. Self-
  // reflections (e.g. career aspirations, feedback for management) are meant for the lead,
  // not peers/cross-department/HR-pool evaluators of the same person.
  const assignment = await getResolvedEvaluationAssignmentForPair(
    periodId,
    user.id,
    evaluateeId,
    'TEAM_LEAD'
  )
  if (!assignment || assignment.relationshipType !== 'TEAM_LEAD') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const row = await prisma.selfEvaluation.findUnique({
    where: { periodId_employeeId: { periodId, employeeId: evaluateeId } },
    include: { employee: { select: { name: true } } },
  })

  if (!row || row.status !== 'SUBMITTED') {
    return NextResponse.json({ status: 'NONE' })
  }

  return NextResponse.json({
    status: 'SUBMITTED',
    submittedAt: row.submittedAt,
    answers: row.answers,
    employeeName: row.employee.name,
  })
}
