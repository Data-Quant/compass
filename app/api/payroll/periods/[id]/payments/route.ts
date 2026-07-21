import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { canManagePayroll } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { getPaymentGrid, savePaymentMarks } from '@/lib/payroll/payment-queries'

const SENT_STATUSES = new Set(['SENDING', 'SENT', 'PARTIAL', 'LOCKED'])

const bodySchema = z.object({
  marks: z.array(
    z.object({
      payrollName: z.string().trim().min(1),
      userId: z.string().nullable(),
      amounts: z.record(z.string(), z.number()),
    })
  ),
})

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession()
    if (!user || !canManagePayroll(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { id } = await params
    const rows = await getPaymentGrid(id)
    return NextResponse.json({ rows })
  } catch (error) {
    console.error('Failed to load payments:', error)
    return NextResponse.json({ error: 'Failed to load payments' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession()
    if (!user || !canManagePayroll(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { id } = await params

    const period = await prisma.payrollPeriod.findUnique({
      where: { id },
      select: { status: true },
    })
    if (!period) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    // Payments are recorded only after the run has been sent.
    if (!SENT_STATUSES.has(period.status)) {
      return NextResponse.json(
        { error: 'Send the payroll before recording payments' },
        { status: 400 }
      )
    }

    const parsed = bodySchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payment data' }, { status: 400 })
    }

    await savePaymentMarks(id, parsed.data.marks)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to save payments:', error)
    return NextResponse.json({ error: 'Failed to save payments' }, { status: 500 })
  }
}
