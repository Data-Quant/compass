import { prisma } from '@/lib/db'
import { formatMonthKey, monthKeyOf } from '../calendar'
import { buildDigests, type DigestInput, type DigestKpi } from '../digest'
import { isDepartmentSetter, isVerifierEligible, type KpiActor } from '../permissions'
import { departmentKeyOf } from '../scope'
import { effectiveStatus } from '../state-machine'
import { departmentLabel, loadKpiContext } from './context'
import { refreshMonthFinalization } from './finalization'
import { resolveMonth } from './months'
import { sendDigests, type SendMail } from './notifications'
import { persistSystemTransitions } from './system'
import { isVisibleKpi } from './views'

export interface DailyJobResult { transitions: number; finalized: number; sent: number; skipped: number; failed: number }

async function activeActors(): Promise<KpiActor[]> {
  const [people, grants] = await Promise.all([
    prisma.user.findMany({ select: { id: true, role: true, position: true, department: true, payrollProfile: { select: { isPayrollActive: true } } } }),
    prisma.kpiRoleGrant.findMany({ select: { userId: true, role: true } }),
  ])
  return people
    .filter((person) => person.payrollProfile?.isPayrollActive ?? true)
    .map((person) => ({
      id: person.id,
      role: person.role,
      position: person.position,
      departmentKey: departmentKeyOf(person.department),
      grants: grants.filter((grant) => grant.userId === person.id).map((grant) => grant.role),
    }))
}

async function digestInput(now: Date): Promise<DigestInput> {
  const [ctx, actors, current, openMonths] = await Promise.all([
    loadKpiContext(),
    activeActors(),
    resolveMonth(monthKeyOf(now)),
    prisma.kpiMonth.findMany({ where: { finalizedAt: null } }),
  ])
  const rows = await prisma.kpi.findMany({
    where: { goal: { archivedAt: null, kpiMonthId: { in: openMonths.map((month) => month.id) } } },
    include: { goal: { include: { kpiMonth: true } }, assignees: true, changes: { where: { status: 'PENDING' } } },
  })
  const visible = rows.filter(isVisibleKpi)
  const kpis: DigestKpi[] = visible.map((row) => ({
    id: row.id,
    title: row.title,
    scope: row.goal.scope,
    setterId: row.goal.setterId,
    departmentKey: row.goal.departmentKey,
    assigneeIds: row.assignees.map((assignee) => assignee.userId),
    claimedById: row.claimedById,
    status: effectiveStatus(row.status, row.goal.kpiMonth, now),
    decidedAt: row.decidedAt,
    appealUsed: row.appealUsedAt !== null,
    claimsDueAt: row.goal.kpiMonth.claimsDueAt,
    verifyDueAt: row.goal.kpiMonth.verifyDueAt,
    targetFinalAt: row.goal.kpiMonth.targetFinalAt,
  }))
  const currentRows = current.id ? visible.filter((row) => row.goal.kpiMonthId === current.id) : []
  const coveredDepartments = new Set(currentRows.filter((row) => row.goal.scope === 'DEPARTMENT').map((row) => row.goal.departmentKey))
  return {
    now,
    currentMonth: { monthKey: formatMonthKey(current), goalsLockAt: current.goalsLockAt },
    teamSetterIds: [...ctx.scope.teamBySetter.keys()],
    teamSettersWithKpis: new Set(currentRows.filter((row) => row.goal.scope === 'TEAM').map((row) => row.goal.setterId)),
    departmentSetterIds: actors.filter((actor) => isDepartmentSetter(actor)).map((actor) => actor.id),
    departmentsWithoutKpis: [...ctx.scope.departmentOwners.keys()]
      .filter((key) => !coveredDepartments.has(key))
      .map((key) => departmentLabel(ctx, key))
      .sort(),
    kpis,
    pendingChanges: visible.flatMap((row) => row.changes.map((change) => ({ kpiId: row.id, requestedById: change.requestedById }))),
    verifiers: actors.filter((actor) => isVerifierEligible(actor)),
    hrIds: actors.filter((actor) => actor.role === 'HR').map((actor) => actor.id),
    lateMonths: openMonths.filter((month) => now > month.targetFinalAt).map((month) => formatMonthKey(month)),
  }
}

/** Saves deadline transitions, finalizes finished months, then sends the day's digests. Safe to run more than once a day. */
export async function runDailyKpiJob(send: SendMail, appUrl: string, now: Date = new Date()): Promise<DailyJobResult> {
  const openMonths = await prisma.kpiMonth.findMany({ where: { finalizedAt: null }, select: { id: true } })
  const transitions = await persistSystemTransitions({ goal: { kpiMonthId: { in: openMonths.map((month) => month.id) } } }, now)
  const finalizedFlags = await Promise.all(openMonths.map((month) => refreshMonthFinalization(month.id, now)))
  const digests = buildDigests(await digestInput(now))
  const sending = await sendDigests(digests, now, send, appUrl)
  return { transitions, finalized: finalizedFlags.filter(Boolean).length, ...sending }
}
