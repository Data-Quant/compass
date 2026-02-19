import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canEditPayrollMaster, canManagePayroll } from '@/lib/permissions'

const createSchema = z.object({
  financialYearId: z.string().trim().min(1),
  incomeFrom: z.coerce.number().min(0),
  incomeTo: z.coerce.number().min(0).nullable().optional(),
  fixedTax: z.coerce.number().min(0),
  taxRate: z.coerce.number().min(0),
  orderIndex: z.coerce.number().int().min(1),
})

const patchSchema = z.object({
  id: z.string().trim().min(1),
  incomeFrom: z.coerce.number().min(0).optional(),
  incomeTo: z.coerce.number().min(0).nullable().optional(),
  fixedTax: z.coerce.number().min(0).optional(),
  taxRate: z.coerce.number().min(0).optional(),
  orderIndex: z.coerce.number().int().min(1).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !canManagePayroll(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const financialYearId = searchParams.get('financialYearId') || undefined

    const taxBrackets = await prisma.payrollTaxBracket.findMany({
      where: financialYearId ? { financialYearId } : undefined,
      orderBy: [{ financialYearId: 'asc' }, { orderIndex: 'asc' }],
    })
    return NextResponse.json({ taxBrackets })
  } catch (error) {
    console.error('Failed to fetch payroll tax brackets:', error)
    return NextResponse.json({ error: 'Failed to fetch payroll tax brackets' }, { status: 500 })
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
    if (parsed.data.incomeTo !== null && parsed.data.incomeTo !== undefined && parsed.data.incomeTo < parsed.data.incomeFrom) {
      return NextResponse.json({ error: 'incomeTo must be >= incomeFrom' }, { status: 400 })
    }

    const taxBracket = await prisma.payrollTaxBracket.create({
      data: {
        financialYearId: parsed.data.financialYearId,
        incomeFrom: parsed.data.incomeFrom,
        incomeTo: parsed.data.incomeTo ?? null,
        fixedTax: parsed.data.fixedTax,
        taxRate: parsed.data.taxRate,
        orderIndex: parsed.data.orderIndex,
      },
    })
    return NextResponse.json({ success: true, taxBracket })
  } catch (error) {
    console.error('Failed to create payroll tax bracket:', error)
    return NextResponse.json({ error: 'Failed to create payroll tax bracket' }, { status: 500 })
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

    const taxBracket = await prisma.payrollTaxBracket.update({
      where: { id: parsed.data.id },
      data: {
        incomeFrom: parsed.data.incomeFrom,
        incomeTo: parsed.data.incomeTo,
        fixedTax: parsed.data.fixedTax,
        taxRate: parsed.data.taxRate,
        orderIndex: parsed.data.orderIndex,
      },
    })
    return NextResponse.json({ success: true, taxBracket })
  } catch (error) {
    console.error('Failed to update payroll tax bracket:', error)
    return NextResponse.json({ error: 'Failed to update payroll tax bracket' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !canEditPayrollMaster(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    await prisma.payrollTaxBracket.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete payroll tax bracket:', error)
    return NextResponse.json({ error: 'Failed to delete payroll tax bracket' }, { status: 500 })
  }
}

