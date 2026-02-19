import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canEditPayrollMaster } from '@/lib/permissions'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    const user = await getSession()
    if (!user || !canEditPayrollMaster(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    const existing = await prisma.payrollFinancialYear.findUnique({
      where: { id },
      select: { id: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Financial year not found' }, { status: 404 })
    }

    await prisma.$transaction([
      prisma.payrollFinancialYear.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      }),
      prisma.payrollFinancialYear.update({
        where: { id },
        data: { isActive: true },
      }),
    ])

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to activate payroll financial year:', error)
    return NextResponse.json({ error: 'Failed to activate payroll financial year' }, { status: 500 })
  }
}

