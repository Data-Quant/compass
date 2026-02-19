import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canEditPayrollMaster, canManagePayroll } from '@/lib/permissions'

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
})

const patchSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1).max(120).optional(),
  isActive: z.boolean().optional(),
})

export async function GET() {
  try {
    const user = await getSession()
    if (!user || !canManagePayroll(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const employmentTypes = await prisma.payrollEmploymentType.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    })

    return NextResponse.json({ employmentTypes })
  } catch (error) {
    console.error('Failed to fetch payroll employment types:', error)
    return NextResponse.json({ error: 'Failed to fetch payroll employment types' }, { status: 500 })
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

    const employmentType = await prisma.payrollEmploymentType.create({
      data: {
        name: parsed.data.name,
        isActive: true,
      },
    })

    return NextResponse.json({ success: true, employmentType })
  } catch (error) {
    console.error('Failed to create payroll employment type:', error)
    return NextResponse.json({ error: 'Failed to create payroll employment type' }, { status: 500 })
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

    const employmentType = await prisma.payrollEmploymentType.update({
      where: { id: parsed.data.id },
      data: {
        name: parsed.data.name,
        isActive: parsed.data.isActive,
      },
    })

    return NextResponse.json({ success: true, employmentType })
  } catch (error) {
    console.error('Failed to update payroll employment type:', error)
    return NextResponse.json({ error: 'Failed to update payroll employment type' }, { status: 500 })
  }
}

