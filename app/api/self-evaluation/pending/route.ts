import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET - whether the caller has an outstanding (DRAFT) self-evaluation for an active period
export async function GET() {
  const user = await getSession()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const pendingRow = await prisma.selfEvaluation.findFirst({
    where: { employeeId: user.id, status: 'DRAFT', period: { isActive: true } },
    include: { period: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  })
  if (!pendingRow) {
    return NextResponse.json({ pending: false })
  }
  return NextResponse.json({
    pending: true,
    periodId: pendingRow.period.id,
    periodName: pendingRow.period.name,
  })
}
