import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canEditPayrollMaster, canManagePayroll } from '@/lib/permissions'
import { ensurePayrollMasterDefaults } from '@/lib/payroll/settings'

const createSchema = z.object({
  code: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(120),
  type: z.enum(['EARNING', 'DEDUCTION']),
  isTaxable: z.boolean().optional().default(false),
})

const patchSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1).max(120).optional(),
  type: z.enum(['EARNING', 'DEDUCTION']).optional(),
  isTaxable: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

export async function GET() {
  try {
    const user = await getSession()
    if (!user || !canManagePayroll(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await ensurePayrollMasterDefaults()
    const salaryHeads = await prisma.payrollSalaryHead.findMany({
      orderBy: [{ isSystem: 'desc' }, { code: 'asc' }],
    })
    return NextResponse.json({ salaryHeads })
  } catch (error) {
    console.error('Failed to fetch payroll salary heads:', error)
    return NextResponse.json({ error: 'Failed to fetch payroll salary heads' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !canEditPayrollMaster(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = createSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error.errors }, { status: 400 })
    }

    const salaryHead = await prisma.payrollSalaryHead.create({
      data: {
        code: parsed.data.code.trim().toUpperCase(),
        name: parsed.data.name,
        type: parsed.data.type,
        isTaxable: parsed.data.isTaxable,
        isSystem: false,
        isActive: true,
      },
    })
    return NextResponse.json({ success: true, salaryHead })
  } catch (error) {
    console.error('Failed to create payroll salary head:', error)
    return NextResponse.json({ error: 'Failed to create payroll salary head' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !canEditPayrollMaster(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = patchSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error.errors }, { status: 400 })
    }

    const existing = await prisma.payrollSalaryHead.findUnique({
      where: { id: parsed.data.id },
      select: { isSystem: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Salary head not found' }, { status: 404 })
    }

    const salaryHead = await prisma.payrollSalaryHead.update({
      where: { id: parsed.data.id },
      data: {
        name: parsed.data.name,
        type: existing.isSystem ? undefined : parsed.data.type,
        isTaxable: parsed.data.isTaxable,
        isActive: parsed.data.isActive,
      },
    })
    return NextResponse.json({ success: true, salaryHead })
  } catch (error) {
    console.error('Failed to update payroll salary head:', error)
    return NextResponse.json({ error: 'Failed to update payroll salary head' }, { status: 500 })
  }
}

