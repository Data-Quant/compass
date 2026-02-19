import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canEditPayrollMaster, canManagePayroll } from '@/lib/permissions'
import { ensurePayrollMasterDefaults } from '@/lib/payroll/settings'

const createSchema = z.object({
  transportMode: z.enum(['CAR', 'BIKE', 'PUBLIC_TRANSPORT']),
  minKm: z.coerce.number().min(0),
  maxKm: z.coerce.number().min(0).nullable().optional(),
  monthlyRate: z.coerce.number().min(0),
  effectiveFrom: z.string().trim().min(1),
  effectiveTo: z.string().trim().optional().nullable(),
})

const patchSchema = z.object({
  id: z.string().trim().min(1),
  transportMode: z.enum(['CAR', 'BIKE', 'PUBLIC_TRANSPORT']).optional(),
  minKm: z.coerce.number().min(0).optional(),
  maxKm: z.coerce.number().min(0).nullable().optional(),
  monthlyRate: z.coerce.number().min(0).optional(),
  effectiveFrom: z.string().trim().optional(),
  effectiveTo: z.string().trim().optional().nullable(),
  isActive: z.boolean().optional(),
})

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date
}

export async function GET() {
  try {
    const user = await getSession()
    if (!user || !canManagePayroll(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await ensurePayrollMasterDefaults()
    const travelTiers = await prisma.payrollTravelAllowanceTier.findMany({
      orderBy: [{ transportMode: 'asc' }, { minKm: 'asc' }],
    })
    return NextResponse.json({ travelTiers })
  } catch (error) {
    console.error('Failed to fetch payroll travel tiers:', error)
    return NextResponse.json({ error: 'Failed to fetch payroll travel tiers' }, { status: 500 })
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

    const effectiveFrom = parseDate(parsed.data.effectiveFrom)
    const effectiveTo = parseDate(parsed.data.effectiveTo || null)
    if (!effectiveFrom) {
      return NextResponse.json({ error: 'Invalid effectiveFrom date' }, { status: 400 })
    }
    if (effectiveTo && effectiveTo < effectiveFrom) {
      return NextResponse.json({ error: 'effectiveTo must be >= effectiveFrom' }, { status: 400 })
    }

    const travelTier = await prisma.payrollTravelAllowanceTier.create({
      data: {
        transportMode: parsed.data.transportMode,
        minKm: parsed.data.minKm,
        maxKm: parsed.data.maxKm ?? null,
        monthlyRate: parsed.data.monthlyRate,
        effectiveFrom,
        effectiveTo,
        isActive: true,
      },
    })

    return NextResponse.json({ success: true, travelTier })
  } catch (error) {
    console.error('Failed to create payroll travel tier:', error)
    return NextResponse.json({ error: 'Failed to create payroll travel tier' }, { status: 500 })
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

    const effectiveFromParsed =
      parsed.data.effectiveFrom !== undefined ? parseDate(parsed.data.effectiveFrom) : undefined
    const effectiveToParsed =
      parsed.data.effectiveTo !== undefined ? parseDate(parsed.data.effectiveTo || null) : undefined
    if (parsed.data.effectiveFrom !== undefined && !effectiveFromParsed) {
      return NextResponse.json({ error: 'Invalid effectiveFrom date' }, { status: 400 })
    }

    const travelTier = await prisma.payrollTravelAllowanceTier.update({
      where: { id: parsed.data.id },
      data: {
        transportMode: parsed.data.transportMode,
        minKm: parsed.data.minKm,
        maxKm: parsed.data.maxKm,
        monthlyRate: parsed.data.monthlyRate,
        effectiveFrom: effectiveFromParsed || undefined,
        effectiveTo: effectiveToParsed === undefined ? undefined : effectiveToParsed,
        isActive: parsed.data.isActive,
      },
    })

    return NextResponse.json({ success: true, travelTier })
  } catch (error) {
    console.error('Failed to update payroll travel tier:', error)
    return NextResponse.json({ error: 'Failed to update payroll travel tier' }, { status: 500 })
  }
}
