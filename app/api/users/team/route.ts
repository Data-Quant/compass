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

    const directReportMappings = await prisma.evaluatorMapping.findMany({
      where: {
        evaluatorId: user.id,
        relationshipType: 'TEAM_LEAD',
        evaluatee: activeFilter,
      },
      select: {
        evaluatee: {
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
        },
      },
      orderBy: {
        evaluatee: {
          name: 'asc',
        },
      },
      take: 50,
    })

    if (directReportMappings.length > 0) {
      return NextResponse.json({
        teamMembers: directReportMappings.map(({ evaluatee }) => ({
          id: evaluatee.id,
          name: evaluatee.name,
          email: evaluatee.email || evaluatee.payrollProfile?.officialEmail || null,
          discordId: evaluatee.discordId,
          department: evaluatee.department,
          position: evaluatee.position,
        })),
        scope: 'direct_reports',
        department: user.department?.trim() || null,
      })
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
