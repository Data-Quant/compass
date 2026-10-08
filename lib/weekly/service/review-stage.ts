// The round's review stage (UX spec, HR steps 3 and 4): HR opens it, and everyone checks their lead, team and peers and
// asks for corrections. Department questions come from the standard bank, so leads write no questions here.
import { prisma } from '@/lib/db'
import { triggerPreEvaluationForPeriod } from '@/lib/pre-evaluation'
import type { ReviewStageView } from '../view-types'
import { recordAudit } from './audit'
import { assertHr, type WeeklyActor } from './context'
import { WeeklyError } from './errors'
import type { WeeklySendMail } from './notifications'
import { sendMappingEmails } from './peer-requests'

export async function reviewStageView(actor: WeeklyActor, periodId: string): Promise<ReviewStageView> {
  assertHr(actor)
  const period = await prisma.evaluationPeriod.findUnique({ where: { id: periodId }, select: { id: true, name: true, preEvaluationTriggeredAt: true, reviewStartDate: true } })
  if (!period) throw new WeeklyError('Evaluation period not found', 404)
  return { periodId, periodName: period.name, openedAt: period.preEvaluationTriggeredAt?.toISOString() ?? null, reviewEndsAt: period.reviewStartDate.toISOString() }
}

/** Opens the review stage (it marks the period, as pre-evaluation did) and emails everyone their lists. */
export async function openReviewStage(actor: WeeklyActor, periodId: string, now: Date, send: WeeklySendMail, appUrl: string): Promise<{ listEmails: number }> {
  assertHr(actor)
  try {
    await triggerPreEvaluationForPeriod(periodId, 'MANUAL', actor.id)
  } catch (error) {
    if (error instanceof Error && /before the evaluation start date|not found/.test(error.message)) throw new WeeklyError(error.message, 409)
    throw error
  }
  const lists = await sendMappingEmails(actor, now, send, appUrl, periodId)
  await recordAudit(prisma, { actorId: actor.id, actorRole: 'HR', action: 'REVIEW_STAGE_OPEN', objectType: 'EvaluationPeriod', objectId: periodId, after: { listEmails: lists.sent + lists.recorded } })
  return { listEmails: lists.sent + lists.recorded }
}
