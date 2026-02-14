import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManagePayroll } from '@/lib/permissions'
import { resolvePayrollIdentityMapping } from '@/lib/payroll/matching'

const updateSchema = z.object({
  userId: z.string().trim().min(1),
  notes: z.string().trim().max(2000).optional(),
})

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSession()
    if (!user || !canManagePayroll(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: mappingId } = await context.params
    const body = await request.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request payload', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const employee = await prisma.user.findUnique({
      where: { id: parsed.data.userId },
      select: { id: true, role: true },
    })
    if (!employee || employee.role !== 'EMPLOYEE') {
      return NextResponse.json({ error: 'userId must point to an EMPLOYEE user' }, { status: 400 })
    }

    const updated = await resolvePayrollIdentityMapping(
      mappingId,
      parsed.data.userId,
      parsed.data.notes
    )

    return NextResponse.json({ success: true, mapping: updated })
  } catch (error) {
    console.error('Failed to update payroll mapping:', error)
    return NextResponse.json({ error: 'Failed to update payroll mapping' }, { status: 500 })
  }
}
