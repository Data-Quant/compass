// The round's scheduled and stage emails (UX spec, section 13): the review reminder, round opened, people behind and
// their leads, HR's weekly digest, late joiners, and round closed. Each builder returns messages for deliverOnce, whose
// dedupe keys make every one of them safe to build again on the next run.
import { prisma } from '@/lib/db'
import { getResolvedEvaluationAssignments } from '@/lib/evaluation-assignments'
import { cycleWeeks, weekStartsAt } from '../calendar'
import { evaluateeExclusion, evaluatorExclusion, isOutsideRedesign } from '../eligibility'
import {
  renderBehindEmail, renderHrDigestEmail, renderJoinerEmail, renderReviewReminderEmail, renderRoundClosedEmail, renderRoundOpenedEmail, renderTeamBehindEmail,
} from '../emails-round'
import { formatKarachiDate } from '../format'
import { isWeeklyRelationshipType } from '../perspectives'
import { OPEN_REQUEST_STATUSES } from '../request-status'
import { addWorkingDays } from '../working-days'
import { loadAnswerRecords } from './answer-states'
import { loadCycle, type CycleWithPeriod } from './cycles'
import { lowEvidenceRows } from './dashboard'
import { loadPeople } from './context'
import { deliverOnce, hrUserIds, type WeeklyEmailMessage, type WeeklySendMail, type WeeklySendResult } from './notifications'
import { mappingOf } from './peer-requests'

const DAY_MS = 24 * 60 * 60 * 1000
/** Unanswered questions from this many weeks back make someone "behind" (UX spec, D-E3). */
export const BEHIND_WEEKS = 2
/** The review reminder goes out this many working days before the review stage ends. */
export const REVIEW_REMINDER_WORKING_DAYS = 2
const OPEN_PROMPT = ['OPEN', 'DRAFT'] as const
const ANSWERED_PROMPT = ['SUBMITTED', 'NOT_OBSERVED'] as const

/** The last moment of the round's last week, as people read it ("3 Jan 2027"). */
export function roundClosesOn(cycle: Pick<CycleWithPeriod, 'weekOneStartsOn' | 'questionWeeks'>): string {
  return formatKarachiDate(new Date(weekStartsAt(cycle.weekOneStartsOn, cycleWeeks(cycle) + 1).getTime() - 1).toISOString())
}

async function weeklyAssignments(periodId: string) {
  return (await getResolvedEvaluationAssignments(periodId)).filter((a) => isWeeklyRelationshipType(a.relationshipType))
}

/** Rounds in their review stage whose deadline is 2 working days away: everyone with lists who has not said they look right. */
export async function reviewReminderMessages(now: Date, appUrl: string): Promise<WeeklyEmailMessage[]> {
  const cycles = await prisma.weeklyCycle.findMany({ where: { status: 'SETUP', reviewDeadline: { not: null } }, select: { periodId: true, reviewDeadline: true } })
  const periods = new Map((await prisma.evaluationPeriod.findMany({
    where: { id: { in: cycles.map((c) => c.periodId) }, isLocked: false, preEvaluationTriggeredAt: { not: null } }, select: { id: true, name: true },
  })).map((p) => [p.id, p]))
  const messages: WeeklyEmailMessage[] = []
  for (const cycle of cycles) {
    const period = periods.get(cycle.periodId)
    if (!period) continue
    const deadline = cycle.reviewDeadline as Date
    // The deadline is the start of its day, and that day still counts.
    if (now.getTime() >= deadline.getTime() + DAY_MS) continue
    if (addWorkingDays(now, REVIEW_REMINDER_WORKING_DAYS, []).getTime() < deadline.getTime()) continue
    const assignments = await weeklyAssignments(cycle.periodId)
    const people = await loadPeople(assignments.flatMap((a) => [a.evaluatorId, a.evaluateeId]))
    const mapped = [...people.values()].filter((p) => p.payrollActive && !isOutsideRedesign(p)).map((p) => p.id)
    const confirmed = new Set((await prisma.mappingConfirmation.findMany({ where: { periodId: cycle.periodId, userId: { in: mapped } }, select: { userId: true } })).map((c) => c.userId))
    const deadlineText = formatKarachiDate(deadline.toISOString())
    for (const userId of mapped.filter((id) => !confirmed.has(id))) {
      messages.push({
        userId, kind: 'weekly-review-reminder', dedupeKey: `weekly-review-reminder:${cycle.periodId}:${userId}`,
        render: (name) => renderReviewReminderEmail({ name, periodName: period.name, deadline: deadlineText, appUrl }),
      })
    }
  }
  return messages
}

/** Everyone who will be asked questions this round. */
export async function roundOpenedMessages(cycle: CycleWithPeriod, now: Date, appUrl: string): Promise<WeeklyEmailMessage[]> {
  const assignments = await weeklyAssignments(cycle.periodId)
  const people = await loadPeople(assignments.map((a) => a.evaluatorId))
  const weeks = cycleWeeks(cycle)
  const closesOn = roundClosesOn(cycle)
  return [...people.values()].filter((p) => evaluatorExclusion(p, now) === null).map((p) => ({
    userId: p.id, kind: 'weekly-round-opened' as const, dedupeKey: `weekly-round-opened:${cycle.id}:${p.id}`,
    render: (name: string) => renderRoundOpenedEmail({ name, periodName: cycle.period.name, weeks, closesOn, appUrl }),
  }))
}

/** Once the round is closed: everyone who was asked questions in it (not only cancelled ones) hears so, once. */
export async function announceRoundClosed(cycleId: string, send: WeeklySendMail, appUrl: string): Promise<WeeklySendResult> {
  const cycle = await loadCycle(cycleId)
  if (cycle.status !== 'CLOSED') return { sent: 0, recorded: 0, skipped: 0, failed: 0 }
  const evaluators = await prisma.weeklyPrompt.groupBy({ by: ['evaluatorId'], where: { cycleId, status: { not: 'CANCELLED' } } })
  return deliverOnce(evaluators.map(({ evaluatorId }) => ({
    userId: evaluatorId, kind: 'weekly-round-closed' as const, dedupeKey: `weekly-round-closed:${cycleId}:${evaluatorId}`,
    render: (name: string) => renderRoundClosedEmail({ name, periodName: cycle.period.name, appUrl }),
  })), send)
}

/** Evaluators with questions from 2 or more weeks ago still open, and how many questions they have open in all. */
async function behindCounts(cycleId: string, week: number): Promise<Map<string, number>> {
  const behind = await prisma.weeklyPrompt.groupBy({ by: ['evaluatorId'], where: { cycleId, status: { in: [...OPEN_PROMPT] }, weekIndex: { lte: week - BEHIND_WEEKS } } })
  if (behind.length === 0) return new Map()
  const open = await prisma.weeklyPrompt.groupBy({
    by: ['evaluatorId'], where: { cycleId, status: { in: [...OPEN_PROMPT] }, evaluatorId: { in: behind.map((b) => b.evaluatorId) } }, _count: { _all: true },
  })
  return new Map(open.map((row) => [row.evaluatorId, row._count._all]))
}

/** Weekly: each person 2+ weeks behind, and each lead with someone on their team who is (D-E3). */
export async function behindMessages(cycle: CycleWithPeriod, week: number, appUrl: string): Promise<WeeklyEmailMessage[]> {
  const counts = await behindCounts(cycle.id, week)
  if (counts.size === 0) return []
  const assignments = await weeklyAssignments(cycle.periodId)
  const people = await loadPeople(counts.keys())
  const byLead = new Map<string, Array<{ name: string; openCount: number }>>()
  for (const [userId, openCount] of counts) {
    for (const leadId of mappingOf(userId, assignments).leads) {
      byLead.set(leadId, [...(byLead.get(leadId) ?? []), { name: people.get(userId)?.name ?? 'Someone', openCount }])
    }
  }
  const scope = `${cycle.id}:week-${week}`
  return [
    ...[...counts].map(([userId, openCount]) => ({
      userId, kind: 'weekly-behind' as const, dedupeKey: `weekly-behind:${scope}:${userId}`,
      render: (name: string) => renderBehindEmail({ name, openCount, appUrl }),
    })),
    ...[...byLead].map(([leadId, team]) => ({
      userId: leadId, kind: 'weekly-team-behind' as const, dedupeKey: `weekly-team-behind:${scope}:${leadId}`,
      render: (name: string) => renderTeamBehindEmail({ name, people: [...team].sort((a, b) => a.name.localeCompare(b.name)), appUrl }),
    })),
  ]
}

/** HR's Monday digest, about the weeks before this one. Low evidence is counted from the week HR is first told about it. */
export async function hrDigestMessages(cycle: CycleWithPeriod, week: number, lowEvidenceFrom: number, appUrl: string): Promise<WeeklyEmailMessage[]> {
  const past = { cycleId: cycle.id, weekIndex: { lt: week } }
  const [asked, answered, behind, answers, openRequests, unreadSelfReviews, lowEvidence] = await Promise.all([
    prisma.weeklyPrompt.count({ where: { ...past, status: { not: 'CANCELLED' } } }),
    prisma.weeklyPrompt.count({ where: { ...past, status: { in: [...ANSWERED_PROMPT] } } }),
    behindCounts(cycle.id, week),
    loadAnswerRecords({ cycleId: cycle.id }),
    prisma.peerChangeRequest.count({ where: { periodId: cycle.periodId, status: { in: OPEN_REQUEST_STATUSES } } }),
    prisma.selfReviewRead.count({ where: { readAt: null, remindedAt: { not: null }, review: { periodId: cycle.periodId } } }),
    week >= lowEvidenceFrom ? lowEvidenceRows(cycle.id) : Promise.resolve([]),
  ])
  const facts = {
    periodName: cycle.period.name, week, totalWeeks: cycleWeeks(cycle), asked, answered, behind: behind.size,
    waitingReview: answers.filter((r) => r.state === 'NEEDS_REVIEW' || r.state === 'FAILED').length,
    lowEvidence: new Set(lowEvidence.map((r) => r.evaluatee.id)).size, openRequests, unreadSelfReviews,
  }
  return (await hrUserIds()).map((userId) => ({
    userId, kind: 'weekly-hr-digest' as const, dedupeKey: `weekly-hr-digest:${cycle.id}:week-${week}:${userId}`,
    render: (name: string) => renderHrDigestEmail({ ...facts, name, appUrl }),
  }))
}

/** A late joiner's leads: told once that they are not in the round, and reminded to give feedback 2 weeks before it closes. */
export async function joinerMessages(cycle: CycleWithPeriod, week: number, now: Date, appUrl: string): Promise<WeeklyEmailMessage[]> {
  const joined = await prisma.user.findMany({ where: { payrollProfile: { joiningDate: { gte: cycle.weekOneStartsOn } } }, select: { id: true } })
  if (joined.length === 0) return []
  const total = cycleWeeks(cycle)
  const [people, optIns] = await Promise.all([
    loadPeople(joined.map((u) => u.id)),
    prisma.weeklyParticipantOverride.findMany({ where: { cycleId: cycle.id, optIn: true }, select: { userId: true } }),
  ])
  const optedIn = new Set(optIns.map((o) => o.userId))
  const late = [...people.values()].filter((p) => !isOutsideRedesign(p) && evaluateeExclusion(p, { now, weekOneStartsOn: cycle.weekOneStartsOn, totalWeeks: total, optedIn: optedIn.has(p.id) }) === 'JOINED_LATE')
  if (late.length === 0) return []
  const assignments = await getResolvedEvaluationAssignments(cycle.periodId)
  const closesOn = roundClosesOn(cycle)
  const remind = week >= total - 1
  return late.flatMap((joiner) => mappingOf(joiner.id, assignments).leads.flatMap((leadId) => {
    const message = (reminder: boolean): WeeklyEmailMessage => ({
      userId: leadId, kind: 'weekly-joiner', dedupeKey: `weekly-joiner${reminder ? '-reminder' : ''}:${cycle.id}:${joiner.id}:${leadId}`,
      render: (name) => renderJoinerEmail({ name, joinerName: joiner.name, periodName: cycle.period.name, closesOn, reminder, appUrl }),
    })
    return remind ? [message(false), message(true)] : [message(false)]
  }))
}
