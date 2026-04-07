import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { isThreeEDepartment } from '@/lib/company-branding'
import { getCollapsedAdminMappings } from '@/lib/evaluation-assignments'
import { buildOrgChartMeta, type OrgChartMapping } from '@/lib/org-chart'

export async function GET() {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const [rawUsers, rawMappings] = await Promise.all([
      prisma.user.findMany({
        where: {
          OR: [
            { payrollProfile: { is: null } },
            { payrollProfile: { is: { isPayrollActive: true } } },
          ],
        },
        select: {
          id: true,
          name: true,
          department: true,
          position: true,
          role: true,
          chartX: true,
          chartY: true,
        },
        orderBy: { name: 'asc' },
      }),
      getCollapsedAdminMappings(),
    ])

    const users = rawUsers.filter((entry) => !isThreeEDepartment(entry.department))
    const visibleUserIds = new Set(users.map((entry) => entry.id))
    const usersById = new Map(users.map((entry) => [entry.id, entry]))
    const mappings: OrgChartMapping[] = rawMappings.flatMap((mapping) => {
      if (!visibleUserIds.has(mapping.evaluatorId) || !visibleUserIds.has(mapping.evaluateeId)) {
        return []
      }

      const evaluator = usersById.get(mapping.evaluatorId)
      const evaluatee = usersById.get(mapping.evaluateeId)
      if (!evaluator || !evaluatee) {
        return []
      }

      return [
        {
          id: mapping.id,
          evaluatorId: mapping.evaluatorId,
          evaluateeId: mapping.evaluateeId,
          relationshipType: mapping.relationshipType,
          evaluator: {
            id: evaluator.id,
            name: evaluator.name,
            department: evaluator.department,
            position: evaluator.position,
            role: evaluator.role,
          },
          evaluatee: {
            id: evaluatee.id,
            name: evaluatee.name,
            department: evaluatee.department,
            position: evaluatee.position,
            role: evaluatee.role,
          },
        },
      ]
    })
    const meta = buildOrgChartMeta(users, mappings)

    return NextResponse.json({
      users,
      mappings,
      meta,
    })
  } catch (error) {
    console.error('Failed to fetch org chart data:', error)
    return NextResponse.json({ error: 'Failed to fetch org chart data' }, { status: 500 })
  }
}
