import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { RelationshipType, normalizeRelationshipTypeForWeighting, toCategorySetKey } from '@/types'
import { calculateRedistributedWeights } from '@/lib/config'
import { isAdminRole } from '@/lib/permissions'
import { getEvaluationQuestionMeta } from '@/lib/pre-evaluation'
import { getResolvedEvaluationAssignments } from '@/lib/evaluation-assignments'
import { shouldReceiveReportForPeriod } from '@/lib/evaluation-profile-rules'
import {
  calculateWeightedEvaluationCompletion,
  filterPooledRelationshipEvaluations,
} from '@/lib/evaluation-completion'
import { applyAuthoritativeDeptPoolEvaluations } from '@/lib/dept-evaluation-pool'
import {
  buildAssignmentLookup,
  resolveEvaluationRelationshipTypeForRow,
} from '@/lib/evaluation-relationship-resolution'

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
        // 2. All users — role filter removed so HR/OA/SECURITY/EXECUTION members
        // who legitimately receive evaluations (e.g. Areebah) aren't dropped.
        // shouldReceiveConstantEvaluations below gates the actual eligibility.
        prisma.user.findMany({
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
            leadQuestion: true,
            evaluator: { select: { id: true, name: true } },
          },
        }),

        // 4. ALL active evaluator assignments for this period
        getResolvedEvaluationAssignments(period.id, { includeUsers: true }),

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
    const mappingsByEvaluator = new Map<string, typeof allMappings>()
    for (const mapping of allMappings) {
      if (!mappingsByEvaluator.has(mapping.evaluatorId)) {
        mappingsByEvaluator.set(mapping.evaluatorId, [])
      }
      mappingsByEvaluator.get(mapping.evaluatorId)!.push(mapping)
    }

    // Evaluations: evaluateeId -> evaluations[]
    const evalsByEmployee = new Map<string, typeof allEvaluations>()
    for (const ev of allEvaluations) {
      if (!evalsByEmployee.has(ev.evaluateeId)) {
        evalsByEmployee.set(ev.evaluateeId, [])
      }
      evalsByEmployee.get(ev.evaluateeId)!.push(ev)
    }
    const evalsByEvaluator = new Map<string, typeof allEvaluations>()
    for (const evaluation of allEvaluations) {
      if (!evalsByEvaluator.has(evaluation.evaluatorId)) {
        evalsByEvaluator.set(evaluation.evaluatorId, [])
      }
      evalsByEvaluator.get(evaluation.evaluatorId)!.push(evaluation)
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
      customWeightMap.get(cw.employeeId)![
        normalizeRelationshipTypeForWeighting(cw.relationshipType as RelationshipType)
      ] = cw.weightagePercentage
    }

    // ── Compute reports for every employee in-memory ──

    const reportableEmployees = employees.filter((employee) =>
      shouldReceiveReportForPeriod(employee, allMappings)
    )

    const reports = reportableEmployees.map((employee) => {
      const employeeMappings = mappingsByEmployee.get(employee.id) || []
      const employeeEvals = evalsByEmployee.get(employee.id) || []
      const effectiveEmployeeEvals = applyAuthoritativeDeptPoolEvaluations({
        evaluateeId: employee.id,
        evaluations: employeeEvals,
        assignments: employeeMappings,
        getAssignmentsForEvaluator: (evaluatorId) =>
          mappingsByEvaluator.get(evaluatorId) || [],
        getEvaluationsForEvaluator: (evaluatorId) =>
          evalsByEvaluator.get(evaluatorId) || [],
      })

      const assignmentLookup = buildAssignmentLookup(
        employeeMappings.map((mapping) => ({
          evaluatorId: mapping.evaluatorId,
          evaluateeId: mapping.evaluateeId,
          relationshipType: mapping.relationshipType as RelationshipType,
        }))
      )

      // Group evaluations by relationship type — use the dept-pool-propagated
      // set so Hamiz's one-per-dept submission is credited to every current
      // member of that dept (including members added after his submission).
      const evalsByType = new Map<RelationshipType, typeof employeeEvals>()
      const submittedSlots: Array<{
        evaluatorId: string
        evaluateeId: string
        relationshipType: RelationshipType
        submittedAt: Date | null
      }> = []
      for (const ev of effectiveEmployeeEvals) {
        const type = resolveEvaluationRelationshipTypeForRow({
          evaluation: ev,
          assignmentLookup,
        })
        if (type) {
          submittedSlots.push({
            evaluatorId: ev.evaluatorId,
            evaluateeId: ev.evaluateeId,
            relationshipType: type,
            submittedAt: ev.submittedAt,
          })
          if (!evalsByType.has(type)) evalsByType.set(type, [])
          evalsByType.get(type)!.push(ev)
        }
      }

      // Determine weights
      const allMappedTypes = [...new Set(
        employeeMappings.map((mapping) =>
          normalizeRelationshipTypeForWeighting(mapping.relationshipType as RelationshipType)
        )
      )]
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
          dynamicWeights = calculateRedistributedWeights(allMappedTypes)
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
        const effectiveTypeEvaluations = filterPooledRelationshipEvaluations(relType, typeEvals)

        // Group by question to average across evaluators
        const questionGroups = new Map<string, typeof typeEvals>()
        for (const ev of effectiveTypeEvaluations) {
          const questionMeta = getEvaluationQuestionMeta(ev)
          if (!questionMeta) continue
          if (!questionGroups.has(questionMeta.key)) questionGroups.set(questionMeta.key, [])
          questionGroups.get(questionMeta.key)!.push(ev)
        }

        let totalRating = 0
        let totalMaxRating = 0
        const evaluatorIds = new Set<string>()

        for (const [, qEvals] of questionGroups.entries()) {
          const questionMeta = getEvaluationQuestionMeta(qEvals[0])
          if (!questionMeta) continue
          if (questionMeta.questionType === 'RATING') {
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
              totalMaxRating += questionMeta.maxRating
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
      const completion = calculateWeightedEvaluationCompletion({
        assignments: employeeMappings.map((mapping) => ({
          evaluatorId: mapping.evaluatorId,
          evaluateeId: mapping.evaluateeId,
          relationshipType: mapping.relationshipType as RelationshipType,
        })),
        submittedSlots,
        weights: dynamicWeights,
      })

      return {
        employeeId: employee.id,
        employeeName: employee.name,
        overallScore,
        completionPercentage: completion.completionPercentage,
        completionBreakdown: completion.breakdown,
        pendingCompletionSlots: completion.pendingSlots,
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
