import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { sendSelfEvaluationInvite } from '@/lib/email'

// POST - remind everyone still pending (DRAFT) for a period, i.e. not-started and
// in-progress alike. Reuses the self-evaluation invite email as the nudge.
export async function POST(request: NextRequest) {
  const user = await getSession()
  if (!user || !isAdminRole(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { periodId } = await request.json()
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

  const pending = await prisma.selfEvaluation.findMany({
    where: { periodId, status: 'DRAFT' },
    select: { employee: { select: { name: true, email: true } } },
  })

  let reminded = 0
  let skippedNoEmail = 0
  for (const row of pending) {
    if (!row.employee.email) {
      skippedNoEmail++
      continue
    }
    try {
      await sendSelfEvaluationInvite({
        to: row.employee.email,
        employeeName: row.employee.name,
        periodName: period.name,
      })
      reminded++
    } catch (err) {
      console.error('Self-evaluation reminder failed for', row.employee.email, err)
    }
  }

  return NextResponse.json({ reminded, skippedNoEmail, pending: pending.length })
}
