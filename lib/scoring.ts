import { prisma } from '@/lib/db'
import { RelationshipType, DEFAULT_WEIGHTAGES } from '@/types'

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

  // Get custom weightages or use defaults
  const weightages = await prisma.weightage.findMany({
    where: { employeeId },
  })

  const weightageMap = new Map<RelationshipType, number>()
  weightages.forEach((w) => {
    weightageMap.set(w.relationshipType, w.weightagePercentage)
  })

  // Get all mappings for this employee to build relationship type map
  const mappings = await prisma.evaluatorMapping.findMany({
    where: { evaluateeId: employeeId },
  })

  const evaluatorToTypeMap = new Map<string, RelationshipType>()
  mappings.forEach((m) => {
    evaluatorToTypeMap.set(m.evaluatorId, m.relationshipType)
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

  // Calculate breakdown for each relationship type
  const breakdown: ScoreBreakdown[] = []

  for (const [relationshipType, typeEvaluations] of evaluationsByType.entries()) {
    // Get weightage (custom or default)
    const weight = weightageMap.get(relationshipType) ?? DEFAULT_WEIGHTAGES[relationshipType]

    // Group by question to calculate averages
    const questionGroups = new Map<string, typeof typeEvaluations>()
    for (const evaluation of typeEvaluations) {
      if (!questionGroups.has(evaluation.questionId)) {
        questionGroups.set(evaluation.questionId, [])
      }
      questionGroups.get(evaluation.questionId)!.push(evaluation)
    }

    // Calculate average rating for this relationship type
    let totalRating = 0
    let totalMaxRating = 0
    let evaluatorIds = new Set<string>()

    for (const [questionId, questionEvals] of questionGroups.entries()) {
      const question = questionEvals[0].question
      if (question.questionType === 'RATING') {
        for (const evaluation of questionEvals) {
          if (evaluation.ratingValue !== null) {
            totalRating += evaluation.ratingValue
            totalMaxRating += question.maxRating
            evaluatorIds.add(evaluation.evaluatorId)
          }
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
