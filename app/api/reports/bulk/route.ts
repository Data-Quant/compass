import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { RelationshipType, toCategorySetKey } from '@/types'
import { calculateRedistributedWeights } from '@/lib/config'
import { isAdminRole } from '@/lib/permissions'

/**
 * Bulk reports endpoint: fetches ALL employee report summaries in 6 DB calls
 * instead of ~360 (40 employees x 9 calls each).
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const periodId = searchParams.get('periodId') || 'active'

    // ── 6 batch queries instead of ~360 sequential ones ──

    // 1. Get the period
    const period =
      periodId === 'active'
        ? await prisma.evaluationPeriod.findFirst({ where: { isActive: true } })
        : await prisma.evaluationPeriod.findUnique({ where: { id: periodId } })

    if (!period) {
      return NextResponse.json({ error: 'Period not found' }, { status: 404 })
    }

    // 2-6: Fetch all data in parallel
    const [employees, allEvaluations, allMappings, allWeightProfiles, allCustomWeightages] =
      await Promise.all([
        // 2. All employees
        prisma.user.findMany({
          where: { role: 'EMPLOYEE' },
          select: { id: true, name: true, department: true, position: true },
        }),

        // 3. ALL evaluations for this period (with question + evaluator)
        prisma.evaluation.findMany({
          where: {
            periodId: period.id,
            submittedAt: { not: null },
          },
          include: {
            question: true,
            evaluator: { select: { id: true, name: true } },
          },
        }),

        // 4. ALL evaluator mappings
        prisma.evaluatorMapping.findMany({
          select: {
            evaluateeId: true,
            evaluatorId: true,
            relationshipType: true,
          },
        }),

        // 5. ALL weight profiles
        prisma.weightProfile.findMany(),

        // 6. ALL custom weightages
        prisma.weightage.findMany(),
      ])

    // ── Build lookup structures in-memory ──

    // Mappings: evaluateeId -> [{ evaluatorId, relationshipType }]
    const mappingsByEmployee = new Map<string, typeof allMappings>()
    for (const m of allMappings) {
      if (!mappingsByEmployee.has(m.evaluateeId)) {
        mappingsByEmployee.set(m.evaluateeId, [])
      }
      mappingsByEmployee.get(m.evaluateeId)!.push(m)
    }

    // Evaluations: evaluateeId -> evaluations[]
    const evalsByEmployee = new Map<string, typeof allEvaluations>()
    for (const ev of allEvaluations) {
      if (!evalsByEmployee.has(ev.evaluateeId)) {
        evalsByEmployee.set(ev.evaluateeId, [])
      }
      evalsByEmployee.get(ev.evaluateeId)!.push(ev)
    }

    // Weight profiles: categorySetKey -> weights
    const weightProfileMap = new Map<string, Record<string, number>>()
    for (const wp of allWeightProfiles) {
      weightProfileMap.set(wp.categorySetKey, wp.weights as Record<string, number>)
    }

    // Custom weightages: employeeId -> Record<relationshipType, weight>
    const customWeightMap = new Map<string, Record<string, number>>()
    for (const cw of allCustomWeightages) {
      if (!customWeightMap.has(cw.employeeId)) {
        customWeightMap.set(cw.employeeId, {})
      }
      customWeightMap.get(cw.employeeId)![cw.relationshipType] = cw.weightagePercentage
    }

    // ── Compute reports for every employee in-memory ──

    const reports = employees.map((employee) => {
      const employeeMappings = mappingsByEmployee.get(employee.id) || []
      const employeeEvals = evalsByEmployee.get(employee.id) || []

      // Build evaluatorId -> relationshipType map
      const evaluatorToType = new Map<string, RelationshipType>()
      for (const m of employeeMappings) {
        evaluatorToType.set(m.evaluatorId, m.relationshipType as RelationshipType)
      }

      // Group evaluations by relationship type
      const evalsByType = new Map<RelationshipType, typeof employeeEvals>()
      for (const ev of employeeEvals) {
        const type = evaluatorToType.get(ev.evaluatorId)
        if (type) {
          if (!evalsByType.has(type)) evalsByType.set(type, [])
          evalsByType.get(type)!.push(ev)
        }
      }

      // Determine weights
      const allMappedTypes = [...new Set(employeeMappings.map((m) => m.relationshipType))]
      const categoryKey = toCategorySetKey(allMappedTypes)
      let dynamicWeights: Record<string, number> | null = null

      if (categoryKey) {
        dynamicWeights = weightProfileMap.get(categoryKey) || null
      }
      if (!dynamicWeights) {
        const custom = customWeightMap.get(employee.id)
        if (custom && Object.keys(custom).length > 0) {
          dynamicWeights = custom
        } else {
          const typesWithEvals = Array.from(evalsByType.keys())
          dynamicWeights = calculateRedistributedWeights(typesWithEvals)
        }
      }

      // Calculate breakdown per relationship type
      const breakdown: Array<{
        relationshipType: string
        weight: number
        normalizedScore: number
        weightedContribution: number
        evaluatorCount: number
      }> = []

      for (const [relType, typeEvals] of evalsByType.entries()) {
        if (relType === 'SELF') continue

        const weight = dynamicWeights[relType] ?? 0

        // Group by question to average across evaluators
        const questionGroups = new Map<string, typeof typeEvals>()
        for (const ev of typeEvals) {
          if (!questionGroups.has(ev.questionId)) questionGroups.set(ev.questionId, [])
          questionGroups.get(ev.questionId)!.push(ev)
        }

        let totalRating = 0
        let totalMaxRating = 0
        const evaluatorIds = new Set<string>()

        for (const [, qEvals] of questionGroups.entries()) {
          const question = qEvals[0].question
          if (question.questionType === 'RATING') {
            let qTotal = 0
            let qCount = 0
            for (const ev of qEvals) {
              if (ev.ratingValue !== null) {
                qTotal += ev.ratingValue
                qCount++
                evaluatorIds.add(ev.evaluatorId)
              }
            }
            if (qCount > 0) {
              totalRating += qTotal / qCount
              totalMaxRating += question.maxRating
            }
          }
        }

        const normalizedScore = totalMaxRating > 0 ? (totalRating / totalMaxRating) * 4 : 0
        const weightedContribution = normalizedScore * weight

        breakdown.push({
          relationshipType: relType,
          weight,
          normalizedScore,
          weightedContribution,
          evaluatorCount: evaluatorIds.size,
        })
      }

      const totalWeighted = breakdown.reduce((s, b) => s + b.weightedContribution, 0)
      const overallScore = (totalWeighted / 4.0) * 100

      return {
        employeeId: employee.id,
        employeeName: employee.name,
        overallScore,
        breakdown,
        employee,
      }
    })

    return NextResponse.json({ period, reports })
  } catch (error) {
    console.error('Failed to fetch bulk reports:', error)
    return NextResponse.json(
      { error: 'Failed to fetch reports' },
      { status: 500 }
    )
  }
}
