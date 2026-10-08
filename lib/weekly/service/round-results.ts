// The round's Close and release tab (UX spec, HR step 9): who gets a report, their score once generated, whether it was
// sent, and releasing reports. It replaces the separate Email page for a round.
import { prisma } from '@/lib/db'
import { queueEmails, sendEmail } from '@/lib/email'
import { getResolvedEvaluationAssignments } from '@/lib/evaluation-assignments'
import { shouldReceiveReportForPeriod } from '@/lib/evaluation-profile-rules'
import { areWeeklyEmailsEnabled } from '../flag'
import type { RoundResultsResponse } from '../view-types'
import { recordAudit } from './audit'
import { publishResults } from './close'
import { assertHr, byName, type WeeklyActor } from './context'
import { WeeklyError } from './errors'

async function cycleOf(periodId: string) {
  const cycle = await prisma.weeklyCycle.findUnique({ where: { periodId }, select: { id: true, status: true, resultsPublishedAt: true } })
  if (!cycle) throw new WeeklyError('This quarter has no evaluation round', 404)
  return cycle
}

export async function roundResults(actor: WeeklyActor, periodId: string): Promise<RoundResultsResponse> {
  assertHr(actor)
  const cycle = await cycleOf(periodId)
  const [users, assignments, reports, emails] = await Promise.all([
    prisma.user.findMany({ select: { id: true, name: true, position: true, department: true } }),
    getResolvedEvaluationAssignments(periodId),
    prisma.report.findMany({ where: { periodId }, select: { employeeId: true, overallScore: true, generatedAt: true } }),
    prisma.emailQueue.findMany({ where: { report: { periodId } }, orderBy: { createdAt: 'desc' }, select: { employeeId: true, emailStatus: true, sentAt: true } }),
  ])
  const rows = users
    .filter((u) => shouldReceiveReportForPeriod(u, assignments.filter((a) => a.evaluateeId === u.id)))
    .map((u) => {
      const report = reports.find((r) => r.employeeId === u.id)
      const email = emails.find((e) => e.employeeId === u.id)
      return {
        person: { id: u.id, name: u.name, position: u.position }, department: u.department,
        score: report?.overallScore ?? null, generatedAt: report?.generatedAt.toISOString() ?? null,
        email: email ? { status: email.emailStatus, sentAt: email.sentAt?.toISOString() ?? null } : null,
      }
    })
    .sort((a, b) => byName(a.person, b.person))
  return { released: cycle.resultsPublishedAt?.toISOString() ?? null, closed: cycle.status === 'CLOSED', emailsOn: areWeeklyEmailsEnabled(), rows }
}

/**
 * Generates one person's report and sends it (only queued while emails are off, e.g. on previews). One person per call,
 * so a whole company is released without one long request.
 */
export async function releaseReport(actor: WeeklyActor, periodId: string, employeeId: string): Promise<{ status: 'PENDING' | 'SENT' | 'FAILED' }> {
  assertHr(actor)
  const cycle = await cycleOf(periodId)
  if (cycle.status !== 'CLOSED') throw new WeeklyError('Close the round before releasing reports', 409)
  await queueEmails(periodId, [employeeId])
  const pending = await prisma.emailQueue.findFirst({ where: { employeeId, report: { periodId }, emailStatus: 'PENDING' }, orderBy: { createdAt: 'desc' } })
  if (pending && areWeeklyEmailsEnabled()) {
    try {
      await sendEmail(pending.id)
    } catch (error) {
      console.error('[round] report email failed', { employeeId, error })
    }
  }
  const latest = await prisma.emailQueue.findFirst({ where: { employeeId, report: { periodId } }, orderBy: { createdAt: 'desc' }, select: { emailStatus: true } })
  await recordAudit(prisma, { cycleId: cycle.id, actorId: actor.id, actorRole: 'HR', action: 'REPORT_RELEASE', objectType: 'User', objectId: employeeId })
  return { status: latest?.emailStatus ?? 'PENDING' }
}

/** Closed → Released, once the reports are out: from now on people can challenge their results. */
export async function markRoundReleased(actor: WeeklyActor, periodId: string, now: Date): Promise<{ challengeDeadline: string }> {
  assertHr(actor)
  const cycle = await cycleOf(periodId)
  return publishResults(actor, cycle.id, now)
}
