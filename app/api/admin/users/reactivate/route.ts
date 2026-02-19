import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { isAdminRole } from '@/lib/permissions'

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    const id = body && typeof body === 'object' && typeof (body as any).id === 'string'
      ? (body as any).id
      : null

    if (!id) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    const existing = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        payrollProfile: {
          select: {
            isPayrollActive: true,
          },
        },
      },
    })

    if (!existing) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (existing.payrollProfile?.isPayrollActive === true) {
      return NextResponse.json({ error: 'User is already active' }, { status: 400 })
    }

    await prisma.$transaction([
      prisma.payrollEmployeeProfile.upsert({
        where: { userId: id },
        update: {
          isPayrollActive: true,
          exitDate: null,
        },
        create: {
          userId: id,
          isPayrollActive: true,
          exitDate: null,
        },
      }),
      prisma.user.update({
        where: { id },
        data: {
          // Allow fresh session issuance post-reactivation.
          passwordVersion: { increment: 1 },
        },
      }),
    ])

    return NextResponse.json({ success: true, reactivated: true })
  } catch (error) {
    console.error('Failed to reactivate user:', error)
    return NextResponse.json({ error: 'Failed to reactivate user' }, { status: 500 })
  }
}

