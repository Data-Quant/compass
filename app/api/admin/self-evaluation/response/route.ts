import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'

// GET - a single employee's SUBMITTED self-evaluation answers, for HR to read from
// the progress view. Lazy-loaded per row so the progress list stays light. Never
// returns drafts.
export async function GET(request: NextRequest) {
  const user = await getSession()
  if (!user || !isAdminRole(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(request.url)
  const periodId = searchParams.get('periodId')
  const employeeId = searchParams.get('employeeId')
  if (!periodId || !employeeId) {
    return NextResponse.json({ error: 'periodId and employeeId are required' }, { status: 400 })
  }

  const row = await prisma.selfEvaluation.findUnique({
    where: { periodId_employeeId: { periodId, employeeId } },
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
