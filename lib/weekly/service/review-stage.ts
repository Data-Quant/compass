// The round's review stage (UX spec, HR steps 3 and 4): HR opens it, leads write their two team questions, and everyone
// checks their lead, team and peers and asks for corrections. It replaces the old pre-evaluation pages.
import { prisma } from '@/lib/db'
import { sendPreEvaluationLeadPrepNotification } from '@/lib/email'
import { setPrepReminderSent, triggerPreEvaluationForPeriod } from '@/lib/pre-evaluation'
import { areWeeklyEmailsEnabled } from '../flag'
import type { ReviewStageView } from '../view-types'
import { recordAudit } from './audit'
import { assertHr, loadPeople, personRef, type WeeklyActor } from './context'
import { WeeklyError } from './errors'
import type { WeeklySendMail } from './notifications'
import { sendMappingEmails } from './peer-requests'

export async function reviewStageView(actor: WeeklyActor, periodId: string): Promise<ReviewStageView> {
  assertHr(actor)
  const period = await prisma.evaluationPeriod.findUnique({ where: { id: periodId }, select: { id: true, name: true, preEvaluationTriggeredAt: true, reviewStartDate: true } })
  if (!period) throw new WeeklyError('Evaluation period not found', 404)
  const preps = await prisma.preEvaluationLeadPrep.findMany({ where: { periodId }, select: { leadId: true, status: true, questionsSubmittedAt: true, questionsCarriedForwardAt: true } })
  const people = await loadPeople(preps.map((p) => p.leadId))
  return {
    periodId, periodName: period.name, openedAt: period.preEvaluationTriggeredAt?.toISOString() ?? null, reviewEndsAt: period.reviewStartDate.toISOString(),
    leads: preps
      .map((p) => ({ lead: personRef(people, p.leadId), status: p.status, questionsSubmitted: Boolean(p.questionsSubmittedAt || p.questionsCarriedForwardAt) }))
      .sort((a, b) => a.lead.name.localeCompare(b.lead.name)),
  }
}

/** Opens the review stage: creates the leads' team-questions tasks and emails everyone their lists. */
export async function openReviewStage(actor: WeeklyActor, periodId: string, now: Date, send: WeeklySendMail, appUrl: string): Promise<{ leadTasks: number; listEmails: number }> {
  assertHr(actor)
  let result
  try {
    result = await triggerPreEvaluationForPeriod(periodId, 'MANUAL', actor.id)
  } catch (error) {
    if (error instanceof Error && /before the evaluation start date|not found/.test(error.message)) throw new WeeklyError(error.message, 409)
    throw error
  }
  // Lead emails go through the classic sender, so they follow the weekly email switch (off on previews).
  if (areWeeklyEmailsEnabled()) {
    for (const prep of result.preps.filter((p) => !p.initialReminderSentAt)) {
      if ((await sendPreEvaluationLeadPrepNotification(prep.id, 'INITIAL')).success) await setPrepReminderSent(prep.id, 'initial')
    }
  }
  const lists = await sendMappingEmails(actor, now, send, appUrl, periodId)
  await recordAudit(prisma, { actorId: actor.id, actorRole: 'HR', action: 'REVIEW_STAGE_OPEN', objectType: 'EvaluationPeriod', objectId: periodId, after: { leadTasks: result.preps.length } })
  return { leadTasks: result.preps.length, listEmails: lists.sent + lists.recorded }
}
