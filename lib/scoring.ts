import { prisma } from '@/lib/db'
import { RelationshipType } from '@/types'
import { calculateRedistributedWeights, DEFAULT_WEIGHTS } from '@/lib/config'

export interface ScoreBreakdown {
  relationshipType: RelationshipType
  weight: number
  rawScore: number
  maxScore: number
  normalizedScore: number
  weightedContribution: number
  evaluatorCount: number
}

export interface EvaluationReport {
  employeeId: string
  employeeName: string
  periodId: string
  periodName: string
  overallScore: number
  breakdown: ScoreBreakdown[]
  qualitativeFeedback: Record<string, string[]>
}

/**
 * Get the available evaluator types for an employee based on their mappings
 */
export async function getAvailableEvaluatorTypes(employeeId: string): Promise<RelationshipType[]> {
  const mappings = await prisma.evaluatorMapping.findMany({
    where: { evaluateeId: employeeId },
    select: { relationshipType: true },
    distinct: ['relationshipType'],
  })
  return mappings.map(m => m.relationshipType as RelationshipType)
}

/**
 * Calculate dynamic weights for an employee based on their available evaluator types
 */
export async function getDynamicWeights(employeeId: string): Promise<Record<string, number>> {
  const availableTypes = await getAvailableEvaluatorTypes(employeeId)
  
  // Check for custom weightages first
  const customWeightages = await prisma.weightage.findMany({
    where: { employeeId },
  })

  if (customWeightages.length > 0) {
    // Use custom weightages
    const weights: Record<string, number> = {}
    customWeightages.forEach(w => {
      weights[w.relationshipType] = w.weightagePercentage
    })
    return weights
  }

  // Calculate redistributed weights based on available types
  return calculateRedistributedWeights(availableTypes)
}

export async function calculateWeightedScore(
  employeeId: string,
  periodId: string
): Promise<EvaluationReport> {
  // Get employee info
  const employee = await prisma.user.findUnique({
    where: { id: employeeId },
  })

  if (!employee) {
    throw new Error('Employee not found')
  }

  // Get period info
  const period = await prisma.evaluationPeriod.findUnique({
    where: { id: periodId },
  })

  if (!period) {
    throw new Error('Evaluation period not found')
  }

  // Get all evaluations for this employee in this period
  const evaluations = await prisma.evaluation.findMany({
    where: {
      evaluateeId: employeeId,
      periodId: periodId,
      submittedAt: { not: null },
    },
    include: {
      question: true,
      evaluator: true,
    },
  })

  // Get all mappings for this employee to build relationship type map
  const mappings = await prisma.evaluatorMapping.findMany({
    where: { evaluateeId: employeeId },
  })

  const evaluatorToTypeMap = new Map<string, RelationshipType>()
  mappings.forEach((m) => {
    evaluatorToTypeMap.set(m.evaluatorId, m.relationshipType as RelationshipType)
  })

  // Group evaluations by relationship type
  const evaluationsByType = new Map<RelationshipType, typeof evaluations>()
  
  for (const evaluation of evaluations) {
    const type = evaluatorToTypeMap.get(evaluation.evaluatorId)
    if (type) {
      if (!evaluationsByType.has(type)) {
        evaluationsByType.set(type, [])
      }
      evaluationsByType.get(type)!.push(evaluation)
    }
  }

  // Get the types that actually have evaluations submitted
  const typesWithEvaluations = Array.from(evaluationsByType.keys())
  
  // Calculate redistributed weights based on types with actual evaluations
  const dynamicWeights = calculateRedistributedWeights(typesWithEvaluations)

  // Calculate breakdown for each relationship type
  const breakdown: ScoreBreakdown[] = []

  for (const [relationshipType, typeEvaluations] of evaluationsByType.entries()) {
    // Get the dynamic weight for this type
    const weight = dynamicWeights[relationshipType] ?? 0

    // Skip SELF evaluations in weighted calculation
    if (relationshipType === 'SELF') {
      continue
    }

    // Group by question to calculate averages
    const questionGroups = new Map<string, typeof typeEvaluations>()
    for (const evaluation of typeEvaluations) {
      if (!questionGroups.has(evaluation.questionId)) {
        questionGroups.set(evaluation.questionId, [])
      }
      questionGroups.get(evaluation.questionId)!.push(evaluation)
    }

    // Calculate average rating for this relationship type
    // When multiple evaluators of same type, average their scores
    let totalRating = 0
    let totalMaxRating = 0
    let evaluatorIds = new Set<string>()

    for (const [questionId, questionEvals] of questionGroups.entries()) {
      const question = questionEvals[0].question
      if (question.questionType === 'RATING') {
        // Average scores from multiple evaluators for each question
        let questionTotal = 0
        let questionCount = 0
        
        for (const evaluation of questionEvals) {
          if (evaluation.ratingValue !== null) {
            questionTotal += evaluation.ratingValue
            questionCount++
            evaluatorIds.add(evaluation.evaluatorId)
          }
        }
        
        if (questionCount > 0) {
          totalRating += questionTotal / questionCount
          totalMaxRating += question.maxRating
        }
      }
    }

    const rawScore = totalRating
    const maxScore = totalMaxRating
    const normalizedScore = maxScore > 0 ? (totalRating / totalMaxRating) * 4 : 0
    const weightedContribution = normalizedScore * weight

    breakdown.push({
      relationshipType,
      weight,
      rawScore,
      maxScore,
      normalizedScore,
      weightedContribution,
      evaluatorCount: evaluatorIds.size,
    })
  }

  // Calculate overall score
  // Sum of all weighted contributions divided by 4 (max score) times 100 for percentage
  const totalWeightedContribution = breakdown.reduce(
    (sum, b) => sum + b.weightedContribution,
    0
  )
  const overallScore = (totalWeightedContribution / 4.0) * 100

  // Aggregate qualitative feedback
  const qualitativeFeedback: Record<string, string[]> = {}
  for (const evaluation of evaluations) {
    if (evaluation.textResponse && evaluation.textResponse.trim()) {
      const questionKey = evaluation.question.questionText
      if (!qualitativeFeedback[questionKey]) {
        qualitativeFeedback[questionKey] = []
      }
      qualitativeFeedback[questionKey].push(evaluation.textResponse)
    }
  }

  return {
    employeeId: employee.id,
    employeeName: employee.name,
    periodId: period.id,
    periodName: period.name,
    overallScore,
    breakdown,
    qualitativeFeedback,
  }
}
