import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { isAdminRole } from '@/lib/permissions'
import { ensurePayrollMasterDefaults } from '@/lib/payroll/settings'

const VALID_USER_ROLES = ['EMPLOYEE', 'HR', 'SECURITY', 'OA'] as const

type PayrollProfilePayload = {
  payrollDepartmentId?: string | null
  designation?: string | null
  officialEmail?: string | null
  cnicNumber?: string | null
  employmentTypeId?: string | null
  joiningDate?: string | null
  exitDate?: string | null
  isPayrollActive?: boolean
  distanceKm?: number | null
  transportMode?: 'CAR' | 'BIKE' | 'PUBLIC_TRANSPORT' | null
  bankName?: string | null
  accountTitle?: string | null
  accountNumber?: string | null
  salaryRevision?: {
    effectiveFrom?: string
    note?: string
    lines?: Array<{
      salaryHeadCode: string
      amount: number
    }>
  }
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date
}

async function upsertPayrollProfileAndRevision(args: {
  userId: string
  actorId: string
  payload?: PayrollProfilePayload
}) {
  const { userId, actorId, payload } = args
  if (!payload) return

  const profileData = {
    departmentId: payload.payrollDepartmentId || null,
    designation: payload.designation || null,
    officialEmail: payload.officialEmail || null,
    cnicNumber: payload.cnicNumber || null,
    employmentTypeId: payload.employmentTypeId || null,
    joiningDate: parseDate(payload.joiningDate),
    exitDate: parseDate(payload.exitDate),
    distanceKm: payload.distanceKm ?? null,
    transportMode: payload.transportMode || null,
    bankName: payload.bankName || null,
    accountTitle: payload.accountTitle || null,
    accountNumber: payload.accountNumber || null,
    ...(typeof payload.isPayrollActive === 'boolean' ? { isPayrollActive: payload.isPayrollActive } : {}),
  }

  const profile = await prisma.payrollEmployeeProfile.upsert({
    where: { userId },
    update: profileData,
    create: {
      userId,
      ...profileData,
      isPayrollActive: payload.isPayrollActive ?? true,
    },
  })

  const revision = payload.salaryRevision
  const lines = revision?.lines || []
  if (!revision?.effectiveFrom || lines.length === 0) return

  const effectiveFrom = parseDate(revision.effectiveFrom)
  if (!effectiveFrom) throw new Error('Invalid salary revision effectiveFrom date')

  const normalizedLines = lines
    .filter((line) => typeof line.salaryHeadCode === 'string' && Number.isFinite(Number(line.amount)))
    .map((line) => ({
      salaryHeadCode: line.salaryHeadCode.trim().toUpperCase(),
      amount: Number(line.amount),
    }))
    .filter((line) => line.salaryHeadCode.length > 0)

  if (normalizedLines.length === 0) return

  const codes = [...new Set(normalizedLines.map((line) => line.salaryHeadCode))]
  const salaryHeads = await prisma.payrollSalaryHead.findMany({
    where: { code: { in: codes }, isActive: true },
    select: { id: true, code: true },
  })
  const headByCode = new Map(salaryHeads.map((head) => [head.code.toUpperCase(), head.id]))
  const unresolved = codes.filter((code) => !headByCode.has(code))
  if (unresolved.length > 0) {
    throw new Error(`Unknown salary head codes: ${unresolved.join(', ')}`)
  }

  const createdRevision = await prisma.payrollSalaryRevision.create({
    data: {
      employeeProfileId: profile.id,
      effectiveFrom,
      note: revision.note || null,
      createdById: actorId,
    },
  })

  await prisma.payrollSalaryRevisionLine.createMany({
    data: normalizedLines.map((line) => ({
      revisionId: createdRevision.id,
      salaryHeadId: headByCode.get(line.salaryHeadCode)!,
      amount: line.amount,
    })),
  })
}

// GET - List all users
export async function GET(_request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await ensurePayrollMasterDefaults()
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        department: true,
        position: true,
        role: true,
        createdAt: true,
        _count: {
          select: {
            evaluatorMappings: true,
            evaluateeMappings: true,
          },
        },
        payrollProfile: {
          include: {
            department: true,
            employmentType: true,
            salaryRevisions: {
              orderBy: { effectiveFrom: 'desc' },
              take: 10,
              include: {
                createdBy: {
                  select: { id: true, name: true },
                },
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
      orderBy: { name: 'asc' },
    })

    const [payrollDepartments, employmentTypes, salaryHeads] = await Promise.all([
      prisma.payrollDepartment.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
      prisma.payrollEmploymentType.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
      prisma.payrollSalaryHead.findMany({ where: { isActive: true }, orderBy: [{ isSystem: 'desc' }, { code: 'asc' }] }),
    ])

    return NextResponse.json({
      users,
      payrollMeta: {
        departments: payrollDepartments,
        employmentTypes,
        salaryHeads,
      },
    })
  } catch (error) {
    console.error('Failed to fetch users:', error)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}

// POST - Create a new user
export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const {
      name,
      email,
      department,
      position,
      role,
      password,
      payrollProfile,
    } = (await request.json()) as {
      name?: string
      email?: string | null
      department?: string | null
      position?: string | null
      role?: string
      password?: string
      payrollProfile?: PayrollProfilePayload
    }

    const normalizedName = typeof name === 'string' ? name.trim() : ''
    if (!normalizedName) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    const normalizedRole = typeof role === 'string' ? role.toUpperCase() : 'EMPLOYEE'
    if (!VALID_USER_ROLES.includes(normalizedRole as (typeof VALID_USER_ROLES)[number])) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    let passwordHash = null
    if (password) {
      if (typeof password !== 'string' || password.length < 6) {
        return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
      }
      passwordHash = await bcrypt.hash(password, 10)
    }

    const newUser = await prisma.user.create({
      data: {
        name: normalizedName,
        email: email || null,
        department: department || null,
        position: position || null,
        role: normalizedRole as (typeof VALID_USER_ROLES)[number],
        passwordHash,
      },
    })

    if (payrollProfile) {
      await upsertPayrollProfileAndRevision({
        userId: newUser.id,
        actorId: user.id,
        payload: payrollProfile,
      })
    }

    return NextResponse.json({ success: true, user: newUser })
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as any).code === 'P2002') {
      return NextResponse.json({ error: 'Email already exists' }, { status: 400 })
    }
    console.error('Failed to create user:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to create user' }, { status: 500 })
  }
}

// PUT - Update a user
export async function PUT(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const {
      id,
      name,
      email,
      department,
      position,
      role,
      payrollProfile,
    } = (await request.json()) as {
      id?: string
      name?: string
      email?: string | null
      department?: string | null
      position?: string | null
      role?: string
      payrollProfile?: PayrollProfilePayload
    }

    if (!id || !name) {
      return NextResponse.json({ error: 'ID and name are required' }, { status: 400 })
    }

    const normalizedRole = typeof role === 'string' ? role.toUpperCase() : 'EMPLOYEE'
    if (!VALID_USER_ROLES.includes(normalizedRole as (typeof VALID_USER_ROLES)[number])) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: {
        name,
        email: email || null,
        department: department || null,
        position: position || null,
        role: normalizedRole as (typeof VALID_USER_ROLES)[number],
      },
    })

    if (payrollProfile) {
      await upsertPayrollProfileAndRevision({
        userId: id,
        actorId: user.id,
        payload: payrollProfile,
      })
    }

    return NextResponse.json({ success: true, user: updatedUser })
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as any).code === 'P2002') {
      return NextResponse.json({ error: 'Email already exists' }, { status: 400 })
    }
    console.error('Failed to update user:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to update user' }, { status: 500 })
  }
}

// DELETE - Delete a user
export async function DELETE(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    let id = searchParams.get('id')

    if (!id) {
      const body = await request.json().catch(() => null)
      if (body && typeof body === 'object') {
        const candidate = (body as any).id ?? (body as any).userId
        if (typeof candidate === 'string') id = candidate
      }
    }

    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    if (id === user.id) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
    }

    const existing = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        payrollProfile: {
          select: {
            isPayrollActive: true,
            exitDate: true,
          },
        },
      },
    })
    if (!existing) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (existing.payrollProfile && existing.payrollProfile.isPayrollActive === false) {
      return NextResponse.json({ error: 'User is already deactivated' }, { status: 400 })
    }

    const now = new Date()
    await prisma.$transaction([
      prisma.payrollEmployeeProfile.upsert({
        where: { userId: id },
        update: {
          isPayrollActive: false,
          exitDate: existing.payrollProfile?.exitDate ?? now,
        },
        create: {
          userId: id,
          isPayrollActive: false,
          exitDate: now,
        },
      }),
      prisma.user.update({
        where: { id },
        data: {
          // Invalidate active sessions for this user immediately.
          passwordVersion: { increment: 1 },
        },
      }),
    ])

    return NextResponse.json({ success: true, deactivated: true })
  } catch (error) {
    console.error('Failed to deactivate user:', error)
    return NextResponse.json({ error: 'Failed to deactivate user' }, { status: 500 })
  }
}
