import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import {
  deriveProgressStatus,
  summarizeProgress,
  SELF_EVAL_PROGRESS_ORDER,
} from '@/lib/self-evaluation-progress'

// GET - per-employee completion status for a period's self-evaluations, plus
// summary counts. Scoped to employees who were actually sent one (have a row).
export async function GET(request: NextRequest) {
  const user = await getSession()
  if (!user || !isAdminRole(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const periodId = new URL(request.url).searchParams.get('periodId')
  if (!periodId) {
    return NextResponse.json({ error: 'periodId is required' }, { status: 400 })
  }

  const period = await prisma.evaluationPeriod.findUnique({
    where: { id: periodId },
    select: { id: true, name: true },
  })
  if (!period) {
    return NextResponse.json({ error: 'Period not found' }, { status: 404 })
  }

  const rows = await prisma.selfEvaluation.findMany({
    where: { periodId },
    select: {
      employeeId: true,
      status: true,
      startedAt: true,
      submittedAt: true,
      employee: { select: { name: true, department: true, position: true, role: true } },
    },
  })

  const items = rows.map((r) => ({
    employeeId: r.employeeId,
    name: r.employee.name,
    department: r.employee.department,
    position: r.employee.position,
    role: r.employee.role,
    progressStatus: deriveProgressStatus({ status: r.status, startedAt: r.startedAt }),
    submittedAt: r.submittedAt,
  }))

  // Pending-first, then alphabetical, so HR sees who to chase at the top.
  items.sort((a, b) => {
    const byStatus =
      SELF_EVAL_PROGRESS_ORDER[a.progressStatus] - SELF_EVAL_PROGRESS_ORDER[b.progressStatus]
    return byStatus !== 0 ? byStatus : a.name.localeCompare(b.name)
  })

  return NextResponse.json({ period, summary: summarizeProgress(items), items })
}
