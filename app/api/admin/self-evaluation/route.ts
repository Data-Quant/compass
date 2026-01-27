import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

// POST - Enable self-evaluation for all employees
export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || user.role !== 'HR') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { action, employeeId } = await request.json()

    if (action === 'enable-all') {
      // Get all employees
      const employees = await prisma.user.findMany({
        where: { role: 'EMPLOYEE' },
      })

      let created = 0
      let skipped = 0

      for (const employee of employees) {
        // Check if self-evaluation mapping already exists
        const existing = await prisma.evaluatorMapping.findFirst({
          where: {
            evaluatorId: employee.id,
            evaluateeId: employee.id,
            relationshipType: 'SELF',
          },
        })

        if (existing) {
          skipped++
          continue
        }

        // Create self-evaluation mapping
        await prisma.evaluatorMapping.create({
          data: {
            evaluatorId: employee.id,
            evaluateeId: employee.id,
            relationshipType: 'SELF',
            isSelfEvaluation: true,
          },
        })
        created++
      }

      return NextResponse.json({
        success: true,
        message: `Enabled self-evaluation for ${created} employees (${skipped} already had it)`,
        created,
        skipped,
      })
    }

    if (action === 'enable-single' && employeeId) {
      // Check if already exists
      const existing = await prisma.evaluatorMapping.findFirst({
        where: {
          evaluatorId: employeeId,
          evaluateeId: employeeId,
          relationshipType: 'SELF',
        },
      })

      if (existing) {
        return NextResponse.json({
          success: true,
          message: 'Self-evaluation already enabled for this employee',
        })
      }

      await prisma.evaluatorMapping.create({
        data: {
          evaluatorId: employeeId,
          evaluateeId: employeeId,
          relationshipType: 'SELF',
          isSelfEvaluation: true,
        },
      })

      return NextResponse.json({
        success: true,
        message: 'Self-evaluation enabled for employee',
      })
    }

    if (action === 'disable-all') {
      const result = await prisma.evaluatorMapping.deleteMany({
        where: { relationshipType: 'SELF' },
      })

      return NextResponse.json({
        success: true,
        message: `Disabled self-evaluation for ${result.count} employees`,
        count: result.count,
      })
    }

    if (action === 'disable-single' && employeeId) {
      await prisma.evaluatorMapping.deleteMany({
        where: {
          evaluatorId: employeeId,
          evaluateeId: employeeId,
          relationshipType: 'SELF',
        },
      })

      return NextResponse.json({
        success: true,
        message: 'Self-evaluation disabled for employee',
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Operation failed' },
      { status: 500 }
    )
  }
}

// GET - Check self-evaluation status
export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || user.role !== 'HR') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const selfEvaluations = await prisma.evaluatorMapping.findMany({
      where: { relationshipType: 'SELF' },
      include: {
        evaluator: {
          select: { id: true, name: true, department: true },
        },
      },
    })

    const totalEmployees = await prisma.user.count({
      where: { role: 'EMPLOYEE' },
    })

    return NextResponse.json({
      selfEvaluations,
      totalEmployees,
      enabledCount: selfEvaluations.length,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch self-evaluation status' },
      { status: 500 }
    )
  }
}
