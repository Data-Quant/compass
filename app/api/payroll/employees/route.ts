import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManagePayroll } from '@/lib/permissions'

export async function GET() {
  try {
    const user = await getSession()
    if (!user || !canManagePayroll(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const employees = await prisma.user.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        role: true,
        department: true,
        position: true,
        payrollProfile: {
          include: {
            department: true,
            employmentType: true,
            salaryRevisions: {
              orderBy: { effectiveFrom: 'desc' },
              take: 3,
              include: {
                lines: {
                  include: {
                    salaryHead: {
                      select: { id: true, code: true, name: true, type: true, isTaxable: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    })

    return NextResponse.json({ employees })
  } catch (error) {
    console.error('Failed to fetch payroll employees:', error)
    return NextResponse.json({ error: 'Failed to fetch payroll employees' }, { status: 500 })
  }
}

