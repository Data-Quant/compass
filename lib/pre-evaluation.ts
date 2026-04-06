import type { Prisma, PreEvaluationLeadPrep, PreEvaluationLeadQuestion, QuestionType } from '@prisma/client'
import { prisma } from '@/lib/db'
import type { RelationshipType } from '@/types'

export const PRE_EVALUATION_QUESTION_COUNT = 2

export type QuestionSourceType = 'GLOBAL' | 'LEAD'

export interface ResolvedEvaluationQuestion {
  id: string
  sourceType: QuestionSourceType
  relationshipType: RelationshipType
  questionText: string
  questionType: QuestionType
  maxRating: number
  orderIndex: number
  sourceLeadId?: string
  sourceLeadName?: string
}

type DbClient = typeof prisma | Prisma.TransactionClient

type PrepWithPeriod = Pick<
  PreEvaluationLeadPrep,
  | 'status'
  | 'questionsSubmittedAt'
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
  const isComplete = Boolean(prep.questionsSubmittedAt)
  const hasPartialSubmission = Boolean(prep.questionsSubmittedAt)

  if (isComplete || prep.completedAt) {
    return 'COMPLETED'
  }
  if (reviewStart <= today) {
    return prep.overriddenAt ? 'OVERRIDDEN' : 'OVERDUE'
  }
  return hasPartialSubmission ? 'IN_PROGRESS' : 'PENDING'
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

export async function syncPrepStatus(db: DbClient, prepId: string) {
  const prep = await db.preEvaluationLeadPrep.findUnique({
    where: { id: prepId },
    select: {
      id: true,
      status: true,
      questionsSubmittedAt: true,
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
  const nextCompletedAt = prep.questionsSubmittedAt ? prep.completedAt || new Date() : null
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

  return deriveLeadRelationships(mappings)
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

  return {
    ...prep,
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

  if (!prep || !prep.questionsSubmittedAt || prep.questions.length === 0) {
    return null
  }

  return {
    sourceLeadId: prep.lead.id,
    sourceLeadName: prep.lead.name,
    questions: prep.questions,
  }
}

async function getLeadQuestionSetForCrossDepartment(
  periodId: string,
  evaluatorId: string,
  evaluateeId: string
) {
  const selection = await prisma.preEvaluationEvaluateeSelection.findFirst({
    where: {
      type: 'CROSS_DEPARTMENT',
      evaluateeId,
      suggestedEvaluatorId: evaluatorId,
      reviewStatus: 'APPROVED',
      prep: {
        periodId,
        questionsSubmittedAt: {
          not: null,
        },
      },
    },
    include: {
      prep: {
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
      },
    },
    orderBy: {
      reviewedAt: 'desc',
    },
  })

  if (!selection || selection.prep.questions.length === 0) {
    return null
  }

  return {
    selectionId: selection.id,
    sourceLeadId: selection.prep.lead.id,
    sourceLeadName: selection.prep.lead.name,
    questions: selection.prep.questions,
  }
}

export async function getResolvedEvaluationQuestions(params: {
  relationshipType: RelationshipType
  periodId: string
  evaluatorId: string
  evaluateeId: string
}) {
  const { relationshipType, periodId, evaluatorId, evaluateeId } = params

  if (relationshipType === 'TEAM_LEAD') {
    const source = await getLeadQuestionSetForTeamLead(periodId, evaluatorId)
    if (source) {
      return {
        sourceType: 'LEAD' as const,
        questions: source.questions.map<ResolvedEvaluationQuestion>((question) => ({
          id: question.id,
          sourceType: 'LEAD',
          relationshipType,
          questionText: question.questionText,
          questionType: 'RATING',
          maxRating: 4,
          orderIndex: question.orderIndex,
          sourceLeadId: source.sourceLeadId,
          sourceLeadName: source.sourceLeadName,
        })),
      }
    }
  }

  if (relationshipType === 'CROSS_DEPARTMENT') {
    const source = await getLeadQuestionSetForCrossDepartment(periodId, evaluatorId, evaluateeId)
    if (!source) {
      return {
        sourceType: 'LEAD' as const,
        questions: [],
        error: 'Cross-department evaluation is not configured for this period.',
      }
    }

    return {
      sourceType: 'LEAD' as const,
      questions: source.questions.map<ResolvedEvaluationQuestion>((question) => ({
        id: question.id,
        sourceType: 'LEAD',
        relationshipType,
        questionText: question.questionText,
        questionType: 'RATING',
        maxRating: 4,
        orderIndex: question.orderIndex,
        sourceLeadId: source.sourceLeadId,
        sourceLeadName: source.sourceLeadName,
      })),
    }
  }

  const globalQuestions = await prisma.evaluationQuestion.findMany({
    where: { relationshipType },
    orderBy: { orderIndex: 'asc' },
  })

  return {
    sourceType: 'GLOBAL' as const,
    questions: globalQuestions.map<ResolvedEvaluationQuestion>((question) => ({
      id: question.id,
      sourceType: 'GLOBAL',
      relationshipType,
      questionText: question.questionText,
      questionType: question.questionType,
      maxRating: question.maxRating,
      orderIndex: question.orderIndex,
    })),
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
  questions: Array<{ orderIndex: number; questionText: string }>,
  db: DbClient = prisma
) {
  await db.preEvaluationLeadQuestion.deleteMany({
    where: { prepId },
  })

  const validQuestions = questions
    .map((question) => ({
      orderIndex: question.orderIndex,
      questionText: question.questionText.trim(),
    }))
    .filter((question) => question.questionText)

  if (validQuestions.length > 0) {
    await db.preEvaluationLeadQuestion.createMany({
      data: validQuestions.map((question) => ({
        prepId,
        orderIndex: question.orderIndex,
        questionText: question.questionText,
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
