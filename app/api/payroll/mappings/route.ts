import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManagePayroll } from '@/lib/permissions'

const statusSchema = z.enum(['AUTO_MATCHED', 'MANUAL_MATCHED', 'UNRESOLVED', 'AMBIGUOUS'])

export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !canManagePayroll(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const statusParam = searchParams.get('status')
    const parsedStatus = statusParam ? statusSchema.safeParse(statusParam) : null
    if (statusParam && !parsedStatus?.success) {
      return NextResponse.json(
        { error: 'Invalid status filter', allowed: statusSchema.options },
        { status: 400 }
      )
    }

    const where = parsedStatus?.success ? { status: parsedStatus.data } : {}
    const [mappings, stats, employees] = await Promise.all([
      prisma.payrollIdentityMapping.findMany({
        where,
        orderBy: [{ status: 'asc' }, { displayPayrollName: 'asc' }],
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              department: true,
            },
          },
        },
      }),
      prisma.payrollIdentityMapping.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
      prisma.user.findMany({
        where: { role: 'EMPLOYEE' },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          department: true,
        },
      }),
    ])

    return NextResponse.json({
      mappings,
      employees,
      stats: Object.fromEntries(stats.map((row) => [row.status, row._count.status])),
    })
  } catch (error) {
    console.error('Failed to fetch payroll mappings:', error)
    return NextResponse.json({ error: 'Failed to fetch payroll mappings' }, { status: 500 })
  }
}
