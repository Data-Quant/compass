import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const activeFilter: Prisma.UserWhereInput = {
      OR: [
        { payrollProfile: { is: null } },
        { payrollProfile: { is: { isPayrollActive: true } } },
      ],
    }

    const trimmedDepartment = user.department?.trim() || null
    const where: Prisma.UserWhereInput = trimmedDepartment
      ? {
          AND: [
            activeFilter,
            { id: { not: user.id } },
            { department: { equals: trimmedDepartment, mode: 'insensitive' } },
          ],
        }
      : {
          AND: [activeFilter, { id: { not: user.id } }],
        }

    const members = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        discordId: true,
        department: true,
        position: true,
        payrollProfile: {
          select: {
            officialEmail: true,
          },
        },
      },
      orderBy: { name: 'asc' },
      take: 50,
    })

    const teamMembers = members.map((member) => ({
      id: member.id,
      name: member.name,
      email: member.email || member.payrollProfile?.officialEmail || null,
      discordId: member.discordId,
      department: member.department,
      position: member.position,
    }))

    return NextResponse.json({
      teamMembers,
      scope: trimmedDepartment ? 'department' : 'company',
      department: trimmedDepartment,
    })
  } catch (error) {
    console.error('Failed to fetch team members:', error)
    return NextResponse.json({ error: 'Failed to fetch team members' }, { status: 500 })
  }
}
