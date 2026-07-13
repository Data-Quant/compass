import type { Prisma, PreEvaluationLeadPrep, PreEvaluationLeadQuestion, QuestionType } from '@prisma/client'
import { prisma } from '@/lib/db'
import type { RelationshipType } from '@/types'
import {
  normalizeRatingDescriptions,
  toRatingDescriptionFields,
  type RatingDescriptions,
} from '@/lib/rating-descriptions'

export const PRE_EVALUATION_QUESTION_COUNT = 2

export type QuestionSourceType = 'GLOBAL' | 'LEAD'

export interface ResolvedEvaluationQuestion {
  id: string
  sourceType: QuestionSourceType
  relationshipType: RelationshipType
  questionText: string
  questionType: QuestionType
  maxRating: number
  ratingDescriptions: RatingDescriptions | null
  orderIndex: number
  sourceLeadId?: string
  sourceLeadName?: string
}

type DbClient = typeof prisma | Prisma.TransactionClient

type PrepWithPeriod = Pick<
  PreEvaluationLeadPrep,
  | 'status'
  | 'questionsSubmittedAt'
  | 'questionsCarriedForwardAt'
  | 'evaluateesSubmittedAt'
  | 'completedAt'
  | 'overdueAt'
  | 'overriddenAt'
> & {
  period: {
    reviewStartDate: Date
  }
}

type LeadRelationshipMapping = {
  evaluatorId: string
  evaluateeId: string
  relationshipType: RelationshipType
}

type PrepQuestionSource = {
  questionsSubmittedAt: Date | null
  questions: Array<PreEvaluationLeadQuestion>
}

type RuntimeGlobalQuestionInput = {
  id: string
  questionText: string
  questionType: QuestionType
  maxRating: number
  rating1Description?: string | null
  rating2Description?: string | null
  rating3Description?: string | null
  rating4Description?: string | null
  orderIndex: number
}

type RuntimeLeadQuestionInput = {
  id: string
  questionText: string
  rating1Description?: string | null
  rating2Description?: string | null
  rating3Description?: string | null
  rating4Description?: string | null
  orderIndex: number
}

type PreviousLeadQuestionPrefill<TQuestion extends { orderIndex: number }> = {
  period: {
    id: string
    name: string
  }
  questionsSubmittedAt: Date | null
  questions: TQuestion[]
}

export interface PreEvaluationSelectionInput {
  type: 'PRIMARY' | 'PEER' | 'CROSS_DEPARTMENT'
  evaluateeId: string
  suggestedEvaluatorId?: string | null
}

function startOfDay(date: Date = new Date()) {
  const normalized = new Date(date)
  normalized.setHours(0, 0, 0, 0)
  return normalized
}

function endOfDay(date: Date = new Date()) {
  const normalized = new Date(date)
  normalized.setHours(23, 59, 59, 999)
  return normalized
}

export function canTriggerPreEvaluation(reviewStartDate: Date) {
  return startOfDay(reviewStartDate) > startOfDay()
}

export function buildPreEvaluationSelectionKey(
  type: 'PRIMARY' | 'PEER' | 'CROSS_DEPARTMENT',
  evaluateeId: string,
  suggestedEvaluatorId?: string | null
) {
  return `${type}:${evaluateeId}:${suggestedEvaluatorId || 'primary'}`
}

export function derivePreEvaluationStatus(
  prep: PrepWithPeriod
): 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'OVERDUE' | 'OVERRIDDEN' {
  const today = startOfDay()
  const reviewStart = startOfDay(prep.period.reviewStartDate)
  // Questions are "handled" for the period when the lead submitted them OR they were
  // carried forward from a previous period (effective by default, no action needed).
  const questionsHandled =
    Boolean(prep.questionsSubmittedAt) || Boolean(prep.questionsCarriedForwardAt)

  if (questionsHandled || prep.completedAt) {
    return 'COMPLETED'
  }
  if (reviewStart <= today) {
    return prep.overriddenAt ? 'OVERRIDDEN' : 'OVERDUE'
  }
  return 'PENDING'
}

export function isPrepEditable(reviewStartDate: Date) {
  return startOfDay(reviewStartDate) > startOfDay()
}

export function deriveLeadRelationships(
  mappings: LeadRelationshipMapping[]
) {
  const directReportsByLead: Record<string, string[]> = {}

  for (const mapping of mappings) {
    if (mapping.relationshipType !== 'TEAM_LEAD') {
      continue
    }

    if (!directReportsByLead[mapping.evaluatorId]) {
      directReportsByLead[mapping.evaluatorId] = []
    }

    if (!directReportsByLead[mapping.evaluatorId].includes(mapping.evaluateeId)) {
      directReportsByLead[mapping.evaluatorId].push(mapping.evaluateeId)
      directReportsByLead[mapping.evaluatorId].sort((first, second) => first.localeCompare(second))
    }
  }

  const leadIds = Object.keys(directReportsByLead).sort((first, second) => first.localeCompare(second))

  return {
    leadIds,
    directReportsByLead,
  }
}

/**
 * Job titles that qualify a person as a team lead for pre-evaluation. Lead
 * status is gated by title, not by whether someone happened to have a report
 * in a quarter's TEAM_LEAD mappings. Matched case-insensitively and trimmed,
 * mirroring SELF_EVAL_EXCLUDED_POSITIONS in lib/self-evaluation.ts.
 */
export const PRE_EVALUATION_LEAD_TITLES: readonly string[] = [
  'Partner',
  'Junior Partner',
  'Principal and Junior Partner',
  'Principal',
  'Managing Partner',
  'Lead',
  'AM Team Lead',
  'Manager',
  'Team Manager',
  'Program Delivery Manager',
]

const PRE_EVALUATION_LEAD_TITLE_SET = new Set(
  PRE_EVALUATION_LEAD_TITLES.map((title) => title.toLowerCase()),
)

/** Whether a person's position qualifies them as a pre-evaluation team lead. */
export function isLeadTitle(position: string | null): boolean {
  if (!position) {
    return false
  }
  return PRE_EVALUATION_LEAD_TITLE_SET.has(position.trim().toLowerCase())
}

/**
 * Narrow mapping-derived lead relationships to only those leads whose title
 * qualifies. Returns a new object; inputs are not mutated. Reports for kept
 * leads are preserved as-is (copied), and no lead ids are invented.
 */
export function filterLeadsByTitle(
  relationships: { leadIds: string[]; directReportsByLead: Record<string, string[]> },
  positionById: Record<string, string | null>,
): { leadIds: string[]; directReportsByLead: Record<string, string[]> } {
  const leadIds = relationships.leadIds.filter((id) => isLeadTitle(positionById[id] ?? null))
  const directReportsByLead: Record<string, string[]> = {}
  for (const id of leadIds) {
    directReportsByLead[id] = [...(relationships.directReportsByLead[id] ?? [])]
  }
  return { leadIds, directReportsByLead }
}

export function hasSubmittedLeadQuestionSet(source: PrepQuestionSource) {
  return Boolean(source.questionsSubmittedAt) && source.questions.length > 0
}

// A lead's questions count in the actual evaluations when they exist and were
// either explicitly submitted by the lead OR carried forward from a prior period.
export function hasEffectiveLeadQuestionSet(source: {
  questionsSubmittedAt: Date | null
  questionsCarriedForwardAt: Date | null
  questions: Array<unknown>
}) {
  return (
    (Boolean(source.questionsSubmittedAt) || Boolean(source.questionsCarriedForwardAt)) &&
    source.questions.length > 0
  )
}

// A prep can receive carried-forward questions only when it is untouched: no
// questions yet, not submitted, and not already carried.
export function isPrepEligibleForCarryForward(prep: {
  questionsSubmittedAt: Date | null
  questionsCarriedForwardAt: Date | null
  questions: Array<unknown>
}) {
  return (
    !prep.questionsSubmittedAt && !prep.questionsCarriedForwardAt && prep.questions.length === 0
  )
}

export function getDefaultQuestionBankRelationshipType(
  relationshipType: RelationshipType
): RelationshipType {
  if (relationshipType === 'TEAM_LEAD') {
    return 'DIRECT_REPORT'
  }

  if (relationshipType === 'DIRECT_REPORT') {
    return 'TEAM_LEAD'
  }

  if (relationshipType === 'CROSS_DEPARTMENT') {
    return 'TEAM_LEAD'
  }

  return relationshipType
}

export function getLeadAuthoredQuestionBankRelationshipType(): RelationshipType {
  return 'DIRECT_REPORT'
}

export function getRuntimeLeadQuestionCount(params: {
  defaultQuestionCount: number
  leadQuestionCount: number
  includeLeadQuestions: boolean
}) {
  return params.defaultQuestionCount + (params.includeLeadQuestions ? params.leadQuestionCount : 0)
}

export function buildRuntimeEvaluationQuestionSet(params: {
  relationshipType: RelationshipType
  globalQuestions: RuntimeGlobalQuestionInput[]
  leadQuestions?: RuntimeLeadQuestionInput[]
  globalSourceLeadId?: string
  globalSourceLeadName?: string
  leadSourceLeadId?: string
  leadSourceLeadName?: string
}) {
  const sortedGlobalQuestions = [...params.globalQuestions].sort((first, second) => {
    if (first.questionType !== second.questionType) {
      return first.questionType === 'RATING' ? -1 : 1
    }

    return first.orderIndex - second.orderIndex
  })
  const sortedLeadQuestions = [...(params.leadQuestions || [])].sort(
    (first, second) => first.orderIndex - second.orderIndex
  )

  const resolvedGlobalQuestions = sortedGlobalQuestions.map<ResolvedEvaluationQuestion>(
    (question) => ({
      id: question.id,
      sourceType: 'GLOBAL',
      relationshipType: params.relationshipType,
      questionText: question.questionText,
      questionType: question.questionType,
      maxRating: question.maxRating,
      ratingDescriptions:
        question.questionType === 'RATING'
          ? normalizeRatingDescriptions(question)
          : null,
      orderIndex: question.orderIndex,
      sourceLeadId: params.globalSourceLeadId,
      sourceLeadName: params.globalSourceLeadName,
    })
  )

  const resolvedLeadQuestions = sortedLeadQuestions.map<ResolvedEvaluationQuestion>(
    (question) => ({
      id: question.id,
      sourceType: 'LEAD',
      relationshipType: params.relationshipType,
      questionText: question.questionText,
      questionType: 'RATING',
      maxRating: 4,
      ratingDescriptions: normalizeRatingDescriptions(question),
      orderIndex: question.orderIndex,
      sourceLeadId: params.leadSourceLeadId,
      sourceLeadName: params.leadSourceLeadName,
    })
  )

  const runtimeQuestions = [
    ...resolvedGlobalQuestions.filter((question) => question.questionType === 'RATING'),
    ...resolvedLeadQuestions,
    ...resolvedGlobalQuestions.filter((question) => question.questionType === 'TEXT'),
  ]

  return runtimeQuestions.map((question, index) => ({
    ...question,
    orderIndex: index + 1,
  }))
}

export function resolvePrepQuestionPrefill<TQuestion extends { orderIndex: number }>(params: {
  currentQuestions: TQuestion[]
  currentQuestionsSubmittedAt: Date | null
  previousSubmission?: PreviousLeadQuestionPrefill<TQuestion> | null
}) {
  const sortedCurrentQuestions = [...params.currentQuestions].sort(
    (first, second) => first.orderIndex - second.orderIndex
  )

  if (sortedCurrentQuestions.length > 0 || params.currentQuestionsSubmittedAt) {
    return {
      questions: sortedCurrentQuestions,
      questionPrefillFrom: null,
    }
  }

  const previousSubmission = params.previousSubmission
  const sortedPreviousQuestions = [...(previousSubmission?.questions || [])].sort(
    (first, second) => first.orderIndex - second.orderIndex
  )

  if (
    !previousSubmission ||
    !previousSubmission.questionsSubmittedAt ||
    sortedPreviousQuestions.length === 0
  ) {
    return {
      questions: sortedCurrentQuestions,
      questionPrefillFrom: null,
    }
  }

  return {
    questions: sortedPreviousQuestions,
    questionPrefillFrom: {
      periodId: previousSubmission.period.id,
      periodName: previousSubmission.period.name,
      submittedAt: previousSubmission.questionsSubmittedAt,
    },
  }
}

export async function syncPrepStatus(db: DbClient, prepId: string) {
  const prep = await db.preEvaluationLeadPrep.findUnique({
    where: { id: prepId },
    select: {
      id: true,
      status: true,
      questionsSubmittedAt: true,
      questionsCarriedForwardAt: true,
      evaluateesSubmittedAt: true,
      completedAt: true,
      overdueAt: true,
      overriddenAt: true,
      period: {
        select: {
          reviewStartDate: true,
        },
      },
    },
  })

  if (!prep) return null

  const nextStatus = derivePreEvaluationStatus(prep)
  const questionsHandled =
    Boolean(prep.questionsSubmittedAt) || Boolean(prep.questionsCarriedForwardAt)
  const nextCompletedAt = questionsHandled ? prep.completedAt || new Date() : null
  const nextOverdueAt =
    nextStatus === 'OVERDUE' || nextStatus === 'OVERRIDDEN'
      ? prep.overdueAt || new Date()
      : null

  return db.preEvaluationLeadPrep.update({
    where: { id: prepId },
    data: {
      status: nextStatus,
      completedAt: nextCompletedAt,
      overdueAt: nextOverdueAt,
    },
  })
}

export async function getLeadIdsForPreEvaluation(db: DbClient, periodId: string) {
  const mappings = await db.evaluatorMapping.findMany({
    where: {
      relationshipType: 'TEAM_LEAD',
    },
    select: {
      evaluatorId: true,
      evaluateeId: true,
      relationshipType: true,
    },
  })

  const relationships = deriveLeadRelationships(mappings)
  if (relationships.leadIds.length === 0) {
    return relationships
  }

  // Gate qualification by job title: mappings supply the reports, but only
  // people whose position is a recognized lead title actually get a prep.
  const users = await db.user.findMany({
    where: { id: { in: relationships.leadIds } },
    select: { id: true, position: true },
  })
  const positionById: Record<string, string | null> = {}
  for (const user of users) {
    positionById[user.id] = user.position
  }

  return filterLeadsByTitle(relationships, positionById)
}

export async function ensurePreEvaluationPrep(
  db: DbClient,
  periodId: string,
  leadId: string,
  directReportIds: string[]
) {
  const prep = await db.preEvaluationLeadPrep.upsert({
    where: {
      periodId_leadId: {
        periodId,
        leadId,
      },
    },
    create: {
      periodId,
      leadId,
    },
    update: {},
  })

  const existingPrimary = await db.preEvaluationEvaluateeSelection.findMany({
    where: {
      prepId: prep.id,
      type: 'PRIMARY',
    },
    select: { evaluateeId: true },
  })

  if (existingPrimary.length === 0 && directReportIds.length > 0) {
    await db.preEvaluationEvaluateeSelection.createMany({
      data: directReportIds.map((evaluateeId) => ({
        prepId: prep.id,
        type: 'PRIMARY',
        evaluateeId,
        selectionKey: buildPreEvaluationSelectionKey('PRIMARY', evaluateeId),
      })),
      skipDuplicates: true,
    })
  }

  return prep
}

// Copy each untouched lead prep's most recent prior submitted questions into the
// given period, stamping questionsCarriedForwardAt so they are effective in the
// evaluations by default while remaining editable until review start. Only fills
// preps that have no questions, are not submitted, and were not already carried, so
// it is idempotent and never overwrites a lead's own choices.
export async function carryForwardLeadQuestions(db: typeof prisma, periodId: string) {
  const preps = await db.preEvaluationLeadPrep.findMany({
    where: { periodId },
    select: {
      id: true,
      leadId: true,
      questionsSubmittedAt: true,
      questionsCarriedForwardAt: true,
      questions: { select: { id: true } },
    },
  })

  const summary = { carried: 0, skippedNoSource: 0, skippedAlreadyTouched: 0 }

  for (const prep of preps) {
    if (!isPrepEligibleForCarryForward(prep)) {
      summary.skippedAlreadyTouched += 1
      continue
    }

    // The lead's most recent prior SUBMITTED question set from any earlier period.
    const source = await db.preEvaluationLeadPrep.findFirst({
      where: {
        leadId: prep.leadId,
        periodId: { not: periodId },
        questionsSubmittedAt: { not: null },
        questions: { some: {} },
      },
      select: {
        periodId: true,
        questions: {
          orderBy: { orderIndex: 'asc' },
          select: {
            orderIndex: true,
            questionText: true,
            rating1Description: true,
            rating2Description: true,
            rating3Description: true,
            rating4Description: true,
          },
        },
      },
      orderBy: [{ questionsSubmittedAt: 'desc' }, { updatedAt: 'desc' }],
    })

    if (!source || source.questions.length === 0) {
      summary.skippedNoSource += 1
      continue
    }

    // Both writes together so a prep never ends up with questions but no carry stamp
    // (or vice versa), which would leave it neither effective nor eligible to retry.
    await db.$transaction([
      db.preEvaluationLeadQuestion.createMany({
        data: source.questions.map((question) => ({
          prepId: prep.id,
          orderIndex: question.orderIndex,
          questionText: question.questionText,
          rating1Description: question.rating1Description,
          rating2Description: question.rating2Description,
          rating3Description: question.rating3Description,
          rating4Description: question.rating4Description,
        })),
      }),
      db.preEvaluationLeadPrep.update({
        where: { id: prep.id },
        data: {
          questionsCarriedForwardAt: new Date(),
          questionsCarriedFromPeriodId: source.periodId,
        },
      }),
    ])
    summary.carried += 1
  }

  return summary
}

export async function triggerPreEvaluationForPeriod(
  periodId: string,
  source: 'AUTO' | 'MANUAL',
  actorId?: string | null
) {
  const period = await prisma.evaluationPeriod.findUnique({
    where: { id: periodId },
    select: {
      id: true,
      name: true,
      startDate: true,
      reviewStartDate: true,
      preEvaluationTriggeredAt: true,
    },
  })

  if (!period) {
    throw new Error('Evaluation period not found')
  }

  if (!canTriggerPreEvaluation(period.reviewStartDate)) {
    throw new Error('Pre-evaluation onboarding can only be triggered before the evaluation start date.')
  }

  const { leadIds, directReportsByLead } = await getLeadIdsForPreEvaluation(prisma, periodId)
  const prepIds: string[] = []
  let createdCount = 0

  await prisma.$transaction(async (tx) => {
    if (!period.preEvaluationTriggeredAt) {
      await tx.evaluationPeriod.update({
        where: { id: periodId },
        data: {
          preEvaluationTriggeredAt: new Date(),
          preEvaluationTriggerSource: source,
          preEvaluationTriggeredById: actorId || null,
        },
      })
    }

    for (const leadId of leadIds) {
      const existing = await tx.preEvaluationLeadPrep.findUnique({
        where: {
          periodId_leadId: {
            periodId,
            leadId,
          },
        },
        select: { id: true },
      })

      const prep = await ensurePreEvaluationPrep(
        tx,
        periodId,
        leadId,
        directReportsByLead[leadId] || []
      )
      prepIds.push(prep.id)
      if (!existing) {
        createdCount += 1
      }
    }
  })

  // Carry each untouched lead's prior questions into this period so they are
  // effective by default. Runs after the trigger transaction commits so a slow
  // carry can never roll back prep creation; it is idempotent on re-run.
  const carrySummary = await carryForwardLeadQuestions(prisma, periodId)

  const preps = prepIds.length
    ? await prisma.preEvaluationLeadPrep.findMany({
        where: { id: { in: prepIds } },
        include: {
          lead: {
            select: {
              id: true,
              name: true,
              email: true,
              department: true,
            },
          },
          period: {
            select: {
              id: true,
              name: true,
              startDate: true,
              reviewStartDate: true,
            },
          },
        },
      })
    : []

  return {
    period,
    leadCount: leadIds.length,
    createdCount,
    prepCount: preps.length,
    carriedCount: carrySummary.carried,
    preps,
  }
}

export async function getCurrentLeadPrep(userId: string) {
  const prep = await prisma.preEvaluationLeadPrep.findFirst({
    where: {
      leadId: userId,
      period: {
        preEvaluationTriggeredAt: {
          not: null,
        },
        reviewStartDate: {
          gte: startOfDay(),
        },
      },
    },
    include: {
      period: {
        select: {
          id: true,
          name: true,
          startDate: true,
          endDate: true,
          reviewStartDate: true,
          isActive: true,
          preEvaluationTriggeredAt: true,
        },
      },
      questions: {
        orderBy: { orderIndex: 'asc' },
      },
      evaluateeSelections: {
        include: {
          evaluatee: {
            select: {
              id: true,
              name: true,
              department: true,
              position: true,
            },
          },
          suggestedEvaluator: {
            select: {
              id: true,
              name: true,
              department: true,
              position: true,
            },
          },
        },
        orderBy: [
          { type: 'asc' },
          { createdAt: 'asc' },
        ],
      },
    },
    orderBy: {
      period: {
        reviewStartDate: 'asc',
      },
    },
  })

  if (!prep) return null

  const previousSubmittedPrep =
    prep.questions.length === 0 && !prep.questionsSubmittedAt
      ? await prisma.preEvaluationLeadPrep.findFirst({
          where: {
            leadId: userId,
            periodId: {
              not: prep.period.id,
            },
            questionsSubmittedAt: {
              not: null,
            },
            questions: {
              some: {},
            },
          },
          select: {
            period: {
              select: {
                id: true,
                name: true,
              },
            },
            questionsSubmittedAt: true,
            questions: {
              orderBy: { orderIndex: 'asc' },
            },
          },
          orderBy: [
            { questionsSubmittedAt: 'desc' },
            { updatedAt: 'desc' },
          ],
        })
      : null

  const [users, directReportMappings] = await Promise.all([
    prisma.user.findMany({
      where: {
        role: 'EMPLOYEE',
        id: { not: userId },
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
      },
      orderBy: { name: 'asc' },
    }),
    prisma.evaluatorMapping.findMany({
      where: {
        evaluatorId: userId,
        relationshipType: 'TEAM_LEAD',
      },
      select: {
        evaluatee: {
          select: {
            id: true,
            name: true,
            department: true,
            position: true,
            role: true,
          },
        },
      },
      orderBy: {
        evaluatee: {
          name: 'asc',
        },
      },
    }),
  ])

  const synced = await syncPrepStatus(prisma, prep.id)
  const effectiveStatus = synced?.status || prep.status
  const resolvedQuestions = resolvePrepQuestionPrefill({
    currentQuestions: prep.questions,
    currentQuestionsSubmittedAt: prep.questionsSubmittedAt,
    previousSubmission: previousSubmittedPrep,
  })

  // For carried-forward preps (persisted questions, not yet lead-submitted), resolve
  // the source period name so the page can show a "carried from {period}" banner.
  const carriedFromPeriod =
    prep.questionsCarriedForwardAt && prep.questionsCarriedFromPeriodId
      ? await prisma.evaluationPeriod.findUnique({
          where: { id: prep.questionsCarriedFromPeriodId },
          select: { id: true, name: true },
        })
      : null

  return {
    ...prep,
    questions: resolvedQuestions.questions,
    questionPrefillFrom: resolvedQuestions.questionPrefillFrom,
    questionsCarriedFrom:
      prep.questionsCarriedForwardAt && carriedFromPeriod
        ? { periodId: carriedFromPeriod.id, periodName: carriedFromPeriod.name }
        : null,
    status: effectiveStatus,
    editable: isPrepEditable(prep.period.reviewStartDate),
    candidateUsers: users,
    directReportUsers: directReportMappings.map((mapping) => mapping.evaluatee),
  }
}

export async function getLeadQuestionSetForPrep(prepId: string) {
  return prisma.preEvaluationLeadQuestion.findMany({
    where: { prepId },
    orderBy: { orderIndex: 'asc' },
  })
}

async function getLeadQuestionSetForTeamLead(periodId: string, leadId: string) {
  const prep = await prisma.preEvaluationLeadPrep.findUnique({
    where: {
      periodId_leadId: {
        periodId,
        leadId,
      },
    },
    include: {
      lead: {
        select: {
          id: true,
          name: true,
        },
      },
      questions: {
        orderBy: { orderIndex: 'asc' },
      },
    },
  })

  if (!prep || !hasEffectiveLeadQuestionSet(prep)) {
    return null
  }

  return {
    sourceLeadId: prep.lead.id,
    sourceLeadName: prep.lead.name,
    questions: prep.questions,
  }
}

async function getGlobalQuestionBank(
  relationshipType: RelationshipType
) {
  const bankRelationshipType = getDefaultQuestionBankRelationshipType(relationshipType)
  const questions = await prisma.evaluationQuestion.findMany({
    where: { relationshipType: bankRelationshipType },
    orderBy: { orderIndex: 'asc' },
  })

  return {
    bankRelationshipType,
    questions,
  }
}

export async function getResolvedEvaluationQuestions(params: {
  relationshipType: RelationshipType
  periodId: string
  evaluatorId: string
  evaluateeId: string
}) {
  const { relationshipType, periodId, evaluatorId } = params
  let leadSource:
    | {
        sourceLeadId: string
        sourceLeadName: string
        questions: Array<PreEvaluationLeadQuestion>
      }
    | null = null

  if (relationshipType === 'TEAM_LEAD') {
    leadSource = await getLeadQuestionSetForTeamLead(periodId, evaluatorId)
  }

  const { bankRelationshipType, questions: globalQuestions } = await getGlobalQuestionBank(
    relationshipType
  )

  const questions = buildRuntimeEvaluationQuestionSet({
    relationshipType,
    globalQuestions,
    leadQuestions: leadSource?.questions,
    globalSourceLeadId:
      relationshipType === 'CROSS_DEPARTMENT' && bankRelationshipType === 'TEAM_LEAD'
        ? 'default-team-lead-bank'
        : undefined,
    globalSourceLeadName:
      relationshipType === 'CROSS_DEPARTMENT' && bankRelationshipType === 'TEAM_LEAD'
        ? 'Default Team Lead Question Bank'
        : undefined,
    leadSourceLeadId: leadSource?.sourceLeadId,
    leadSourceLeadName: leadSource?.sourceLeadName,
  })

  if (questions.length === 0) {
    return {
      sourceType: leadSource ? 'LEAD' as const : 'GLOBAL' as const,
      questions,
      error:
        relationshipType === 'CROSS_DEPARTMENT'
          ? 'No default Team Lead questions are configured for cross-department evaluations.'
          : relationshipType === 'TEAM_LEAD'
            ? 'No default Direct Reports questions are configured for team lead evaluations.'
            : relationshipType === 'DIRECT_REPORT'
              ? 'No default Team Lead questions are configured for direct report evaluations.'
          : 'No default questions are configured for this relationship type.',
    }
  }

  return {
    sourceType: leadSource ? 'LEAD' as const : 'GLOBAL' as const,
    questions,
  }
}

export async function getResolvedQuestionCount(params: {
  relationshipType: RelationshipType
  periodId: string
  evaluatorId: string
  evaluateeId: string
}) {
  const resolved = await getResolvedEvaluationQuestions(params)
  return resolved.questions.length
}

export function getEvaluationQuestionMeta(
  evaluation: {
    questionId: string | null
    question?: {
      questionText: string
      maxRating: number
      questionType: QuestionType
    } | null
    leadQuestionId?: string | null
    leadQuestion?: {
      questionText: string
      orderIndex: number
    } | null
  }
) {
  if (evaluation.question) {
    return {
      sourceType: 'GLOBAL' as const,
      key: `GLOBAL:${evaluation.questionId}`,
      questionText: evaluation.question.questionText,
      maxRating: evaluation.question.maxRating,
      questionType: evaluation.question.questionType,
    }
  }

  if (evaluation.leadQuestion) {
    return {
      sourceType: 'LEAD' as const,
      key: `LEAD:${evaluation.leadQuestionId}`,
      questionText: evaluation.leadQuestion.questionText,
      maxRating: 4,
      questionType: 'RATING' as const,
    }
  }

  return null
}

export async function saveDraftQuestions(
  prepId: string,
  questions: Array<{
    orderIndex: number
    questionText: string
    ratingDescriptions?: RatingDescriptions | null
  }>,
  db: DbClient = prisma
) {
  await db.preEvaluationLeadQuestion.deleteMany({
    where: { prepId },
  })

  const validQuestions = questions
    .map((question) => ({
      orderIndex: question.orderIndex,
      questionText: question.questionText.trim(),
      ratingDescriptions: question.ratingDescriptions,
    }))
    .filter((question) => question.questionText)

  if (validQuestions.length > 0) {
    await db.preEvaluationLeadQuestion.createMany({
      data: validQuestions.map((question) => ({
        prepId,
        orderIndex: question.orderIndex,
        questionText: question.questionText,
        ...toRatingDescriptionFields(question.ratingDescriptions),
      })),
    })
  }
}

export async function saveDraftSelections(
  prepId: string,
  selections: PreEvaluationSelectionInput[],
  db: DbClient = prisma
) {
  await db.preEvaluationEvaluateeSelection.deleteMany({
    where: { prepId },
  })

  if (selections.length === 0) {
    return
  }

  await db.preEvaluationEvaluateeSelection.createMany({
    data: selections.map((selection) => ({
      prepId,
      type: selection.type,
      evaluateeId: selection.evaluateeId,
      suggestedEvaluatorId: selection.suggestedEvaluatorId || null,
      selectionKey: buildPreEvaluationSelectionKey(
        selection.type,
        selection.evaluateeId,
        selection.suggestedEvaluatorId || null
      ),
    })),
    skipDuplicates: true,
  })
}

export function validatePreEvaluationSelections(
  selections: PreEvaluationSelectionInput[],
  options: {
    directReportIds: Set<string>
    allowedEvaluateeIds?: Set<string>
  }
) {
  const seen = new Set<string>()
  const allowedEvaluateeIds = options.allowedEvaluateeIds || options.directReportIds

  for (const selection of selections) {
    if (selection.type === 'PRIMARY') {
      if (selection.suggestedEvaluatorId) {
        return 'Primary selections cannot include a suggested evaluator'
      }
      if (!options.directReportIds.has(selection.evaluateeId)) {
        return 'Primary selections must be team members who report to you'
      }
    }

    if ((selection.type === 'CROSS_DEPARTMENT' || selection.type === 'PEER') && !selection.suggestedEvaluatorId) {
      return `${selection.type === 'PEER' ? 'Peer' : 'Cross-department'} selections require a suggested evaluator`
    }

    if (
      (selection.type === 'CROSS_DEPARTMENT' || selection.type === 'PEER') &&
      !allowedEvaluateeIds.has(selection.evaluateeId)
    ) {
      return 'Evaluator change requests are only allowed for you or your direct reports'
    }

    if (selection.suggestedEvaluatorId && selection.suggestedEvaluatorId === selection.evaluateeId) {
      return 'An employee cannot be assigned to evaluate themselves'
    }

    const key = buildPreEvaluationSelectionKey(
      selection.type,
      selection.evaluateeId,
      selection.suggestedEvaluatorId || null
    )

    if (seen.has(key)) {
      return 'Duplicate evaluatee selections are not allowed'
    }
    seen.add(key)
  }

  return null
}

export function isReminderDay(targetDate: Date, periodStartDate: Date) {
  return startOfDay(targetDate).getTime() === startOfDay(periodStartDate).getTime()
}

export async function findDuePreEvaluationPeriods() {
  const today = startOfDay()
  const dueDate = new Date(today)
  dueDate.setDate(dueDate.getDate() + 14)
  const nextDay = new Date(dueDate)
  nextDay.setDate(nextDay.getDate() + 1)

  return prisma.evaluationPeriod.findMany({
    where: {
      preEvaluationTriggeredAt: null,
      reviewStartDate: {
        gte: dueDate,
        lt: nextDay,
      },
    },
    orderBy: { reviewStartDate: 'asc' },
  })
}

export async function markOverduePreEvaluations() {
  const today = endOfDay()
  const overduePreps = await prisma.preEvaluationLeadPrep.findMany({
    where: {
      completedAt: null,
      period: {
        reviewStartDate: {
          lte: today,
        },
      },
      overdueAt: null,
    },
    select: { id: true },
  })

  if (overduePreps.length === 0) {
    return { count: 0 }
  }

  await prisma.preEvaluationLeadPrep.updateMany({
    where: {
      id: {
        in: overduePreps.map((prep) => prep.id),
      },
    },
    data: {
      overdueAt: new Date(),
      status: 'OVERDUE',
    },
  })

  return { count: overduePreps.length }
}

export async function getPreEvaluationReminderCandidates(dayOffset: 7 | 1) {
  const targetDate = startOfDay()
  targetDate.setDate(targetDate.getDate() + dayOffset)
  const nextDay = new Date(targetDate)
  nextDay.setDate(nextDay.getDate() + 1)

  const reminderField =
    dayOffset === 7 ? 'sevenDayReminderSentAt' : 'oneDayReminderSentAt'

  return prisma.preEvaluationLeadPrep.findMany({
    where: {
      completedAt: null,
      questionsSubmittedAt: null,
      // Carried-forward preps already have effective questions — don't nag the lead.
      questionsCarriedForwardAt: null,
      period: {
        reviewStartDate: {
          gte: targetDate,
          lt: nextDay,
        },
      },
      [reminderField]: null,
    } as Prisma.PreEvaluationLeadPrepWhereInput,
    include: {
      lead: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      period: {
        select: {
          id: true,
          name: true,
          startDate: true,
          reviewStartDate: true,
        },
      },
    },
  })
}

export async function setPrepReminderSent(prepId: string, reminderType: 'initial' | '7-day' | '1-day') {
  const data =
    reminderType === 'initial'
      ? { initialReminderSentAt: new Date() }
      : reminderType === '7-day'
        ? { sevenDayReminderSentAt: new Date() }
        : { oneDayReminderSentAt: new Date() }

  return prisma.preEvaluationLeadPrep.update({
    where: { id: prepId },
    data,
  })
}
