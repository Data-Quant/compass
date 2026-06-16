import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManagePayroll } from '@/lib/permissions'

interface RouteContext {
  params: Promise<{ id: string }>
}

// Operational payroll-profile fields editable by anyone who manages payroll
// (HR + O&A). Salary revisions, bank details, CNIC, and official email are
// intentionally excluded here and remain HR-only via the admin users API.
const updateSchema = z.object({
  designation: z.string().trim().max(200).nullable().optional(),
  payrollDepartmentId: z.string().trim().min(1).nullable().optional(),
  employmentTypeId: z.string().trim().min(1).nullable().optional(),
  joiningDate: z.string().trim().nullable().optional(),
  exitDate: z.string().trim().nullable().optional(),
  distanceKm: z.coerce.number().min(0).max(100000).nullable().optional(),
  transportMode: z.enum(['CAR', 'BIKE', 'PUBLIC_TRANSPORT']).nullable().optional(),
  isPayrollActive: z.boolean().optional(),
})

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const user = await getSession()
    if (!user || !canManagePayroll(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: userId } = await context.params
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        payrollProfile: {
          select: {
            designation: true,
            departmentId: true,
            employmentTypeId: true,
            joiningDate: true,
            exitDate: true,
            distanceKm: true,
            transportMode: true,
            isPayrollActive: true,
          },
        },
      },
    })
    if (!target) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }

    const profile = target.payrollProfile
    return NextResponse.json({
      profile: {
        userId: target.id,
        name: target.name,
        designation: profile?.designation ?? null,
        payrollDepartmentId: profile?.departmentId ?? null,
        employmentTypeId: profile?.employmentTypeId ?? null,
        joiningDate: profile?.joiningDate ?? null,
        exitDate: profile?.exitDate ?? null,
        distanceKm: profile?.distanceKm ?? null,
        transportMode: profile?.transportMode ?? null,
        isPayrollActive: profile?.isPayrollActive ?? true,
      },
    })
  } catch (error) {
    console.error('Failed to fetch payroll employee profile:', error)
    return NextResponse.json({ error: 'Failed to fetch payroll employee profile' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSession()
    if (!user || !canManagePayroll(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: userId } = await context.params
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
    if (!target) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 })
    }

    const parsed = updateSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error.errors }, { status: 400 })
    }
    const data = parsed.data

    if (data.payrollDepartmentId) {
      const dept = await prisma.payrollDepartment.findUnique({
        where: { id: data.payrollDepartmentId },
        select: { id: true },
      })
      if (!dept) return NextResponse.json({ error: 'Invalid department' }, { status: 400 })
    }
    if (data.employmentTypeId) {
      const type = await prisma.payrollEmploymentType.findUnique({
        where: { id: data.employmentTypeId },
        select: { id: true },
      })
      if (!type) return NextResponse.json({ error: 'Invalid employment type' }, { status: 400 })
    }

    // Build a patch containing only the fields the request actually sent, so a
    // partial save never blanks out an unrelated field.
    const profileData: Record<string, unknown> = {}
    if (data.designation !== undefined) profileData.designation = data.designation?.trim() || null
    if (data.payrollDepartmentId !== undefined) profileData.departmentId = data.payrollDepartmentId || null
    if (data.employmentTypeId !== undefined) profileData.employmentTypeId = data.employmentTypeId || null
    if (data.joiningDate !== undefined) profileData.joiningDate = parseDate(data.joiningDate)
    if (data.exitDate !== undefined) profileData.exitDate = parseDate(data.exitDate)
    if (data.distanceKm !== undefined) profileData.distanceKm = data.distanceKm
    if (data.transportMode !== undefined) profileData.transportMode = data.transportMode
    if (data.isPayrollActive !== undefined) profileData.isPayrollActive = data.isPayrollActive

    await prisma.payrollEmployeeProfile.upsert({
      where: { userId },
      update: profileData,
      create: {
        userId,
        ...profileData,
        isPayrollActive: data.isPayrollActive ?? true,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to update payroll employee profile:', error)
    return NextResponse.json({ error: 'Failed to update payroll employee profile' }, { status: 500 })
  }
}
