import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canManagePayroll } from '@/lib/permissions'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    const user = await getSession()
    if (!user || !canManagePayroll(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const [periods, mappingStats, envelopeStats] = await Promise.all([
      prisma.payrollPeriod.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
      prisma.payrollIdentityMapping.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
      prisma.payrollDocuSignEnvelope.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
    ])

    const statusCounts = Object.fromEntries(periods.map((row) => [row.status, row._count.status]))
    const mappingCounts = Object.fromEntries(mappingStats.map((row) => [row.status, row._count.status]))
    const envelopeCounts = Object.fromEntries(envelopeStats.map((row) => [row.status, row._count.status]))

    const recentPeriods = await prisma.payrollPeriod.findMany({
      orderBy: { periodStart: 'desc' },
      take: 8,
      select: {
        id: true,
        label: true,
        periodStart: true,
        periodEnd: true,
        status: true,
        sourceType: true,
        summaryJson: true,
        _count: {
          select: {
            inputValues: true,
            computedValues: true,
            receipts: true,
          },
        },
      },
    })

    return NextResponse.json({
      statusCounts,
      mappingCounts,
      envelopeCounts,
      recentPeriods,
    })
  } catch (error) {
    console.error('Failed to fetch payroll dashboard:', error)
    return NextResponse.json({ error: 'Failed to fetch payroll dashboard' }, { status: 500 })
  }
}
