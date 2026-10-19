// §9 Dashboards: completion/compliance %, status by department, overdue and
// expired lists, 6-cycle trend (clones inherit their lineage's history), and
// flags (unreviewed expiries, repeat expiries, self-reviews, late/extended).
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { canViewConsole, type SecurityActor } from '../access'
import { complianceStats, repeatExpiredUserIds, type ComplianceStats } from '../compliance'
import { isFinalTaskStatus, type TaskStatus } from '../types'
import { requireCapability } from './actor'
import type { Db } from './db'
import { peopleById, personOrUnknown, type PersonSummary } from './directory'
import { notFound } from './errors'
import { applyDueExpiries } from './expiry'

const TREND_CYCLES = 6

const TASK_SELECT = {
  id: true,
  userId: true,
  status: true,
  deadline: true,
  firstSubmittedAt: true,
  expiryReason: true,
  unreviewedFlag: true,
  lateEnrollment: true,
  extendedAt: true,
} satisfies Prisma.SecurityTaskSelect

type DashTask = Prisma.SecurityTaskGetPayload<{ select: typeof TASK_SELECT }>

const statsOf = (tasks: readonly DashTask[]): ComplianceStats =>
  complianceStats(tasks.map((task) => ({ status: task.status as TaskStatus, submitted: task.firstSubmittedAt !== null })))

export interface TaskRow {
  taskId: string
  person: PersonSummary
  status: TaskStatus
  deadline: string
  expiryReason: string | null
  lateEnrollment: boolean
  extended: boolean
}

export interface CampaignDashboard {
  campaign: { id: string; name: string; control: string; status: string; version: number; frequency: string }
  cycle: { id: string; number: number; openAt: string; deadline: string; scheduledCloseAt: string; actualCloseAt: string | null; status: string } | null
  stats: ComplianceStats | null
  byStatus: Record<string, number>
  byDepartment: Array<{ department: string; stats: ComplianceStats; byStatus: Record<string, number> }>
  overdue: TaskRow[]
  expired: TaskRow[]
  unreviewedExpired: TaskRow[]
  ownTimeline: TaskRow[]
  repeatExpired: PersonSummary[]
  trend: Array<{ cycleId: string; label: string; openAt: string; compliancePct: number | null; completionPct: number | null; inScope: number }>
}

function countBy<T>(items: readonly T[], key: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => ({ ...acc, [key(item)]: (acc[key(item)] ?? 0) + 1 }), {})
}

function rowOf(task: DashTask, people: ReadonlyMap<string, PersonSummary>): TaskRow {
  return {
    taskId: task.id,
    person: personOrUnknown(people, task.userId) as PersonSummary,
    status: task.status as TaskStatus,
    deadline: task.deadline.toISOString(),
    expiryReason: task.expiryReason,
    lateEnrollment: task.lateEnrollment,
    extended: task.extendedAt !== null,
  }
}

async function lineageTrend(lineageId: string, db: Db): Promise<CampaignDashboard['trend']> {
  const cycles = await db.securityCycle.findMany({
    where: { campaign: { lineageId } },
    orderBy: { openAt: 'desc' },
    take: TREND_CYCLES,
    include: { campaign: { select: { version: true } }, tasks: { select: TASK_SELECT } },
  })
  return cycles.reverse().map((cycle) => {
    const stats = statsOf(cycle.tasks)
    return {
      cycleId: cycle.id,
      label: `v${cycle.campaign.version} · cycle ${cycle.number}`,
      openAt: cycle.openAt.toISOString(),
      compliancePct: stats.compliancePct,
      completionPct: stats.completionPct,
      inScope: stats.inScope,
    }
  })
}

/** Users whose two most recent tasks in this campaign lineage both expired. */
async function repeatExpiredFor(lineageId: string, db: Db): Promise<string[]> {
  const tasks = await db.securityTask.findMany({
    where: { cycle: { campaign: { lineageId } } },
    select: { userId: true, status: true, cycle: { select: { openAt: true } } },
  })
  const byUser = new Map<string, Array<{ cycleNumber: number; status: TaskStatus }>>()
  for (const task of tasks) {
    if (!isFinalTaskStatus(task.status as TaskStatus)) continue
    const list = byUser.get(task.userId) ?? []
    byUser.set(task.userId, [...list, { cycleNumber: task.cycle.openAt.getTime(), status: task.status as TaskStatus }])
  }
  return repeatExpiredUserIds(byUser)
}

export async function campaignDashboard(actor: SecurityActor, campaignId: string, now: Date, db: Db = prisma): Promise<CampaignDashboard> {
  requireCapability(canViewConsole(actor))
  await applyDueExpiries({ campaignId }, now, db)
  const campaign = await db.securityCampaign.findUnique({ where: { id: campaignId } })
  if (!campaign) throw notFound('Campaign not found')
  const cycle = await db.securityCycle.findFirst({ where: { campaignId }, orderBy: { number: 'desc' } })
  const tasks = cycle ? await db.securityTask.findMany({ where: { cycleId: cycle.id }, select: TASK_SELECT }) : []
  const repeatIds = await repeatExpiredFor(campaign.lineageId, db)
  const people = await peopleById([...tasks.map((task) => task.userId), ...repeatIds], db)
  const departmentOf = (task: DashTask) => people.get(task.userId)?.department?.trim() || 'No department'
  const departments = [...new Set(tasks.map(departmentOf))].sort()
  const returnedOrOpen: TaskStatus[] = ['NOT_STARTED', 'IN_PROGRESS', 'REJECTED', 'REQUIRES_INFO']

  return {
    campaign: { id: campaign.id, name: campaign.name, control: campaign.control, status: campaign.status, version: campaign.version, frequency: campaign.frequency },
    cycle: cycle
      ? {
          id: cycle.id,
          number: cycle.number,
          openAt: cycle.openAt.toISOString(),
          deadline: cycle.deadline.toISOString(),
          scheduledCloseAt: cycle.scheduledCloseAt.toISOString(),
          actualCloseAt: cycle.actualCloseAt?.toISOString() ?? null,
          status: cycle.status,
        }
      : null,
    stats: cycle ? statsOf(tasks) : null,
    byStatus: countBy(tasks, (task) => task.status),
    byDepartment: departments.map((department) => {
      const subset = tasks.filter((task) => departmentOf(task) === department)
      return { department, stats: statsOf(subset), byStatus: countBy(subset, (task) => task.status) }
    }),
    overdue: tasks.filter((task) => task.deadline < now && returnedOrOpen.includes(task.status as TaskStatus)).map((task) => rowOf(task, people)),
    expired: tasks.filter((task) => task.status === 'EXPIRED').map((task) => rowOf(task, people)),
    unreviewedExpired: tasks.filter((task) => task.unreviewedFlag).map((task) => rowOf(task, people)),
    ownTimeline: tasks.filter((task) => task.lateEnrollment || task.extendedAt !== null).map((task) => rowOf(task, people)),
    repeatExpired: repeatIds.map((id) => personOrUnknown(people, id) as PersonSummary),
    trend: await lineageTrend(campaign.lineageId, db),
  }
}

export interface CompanyDashboard {
  overall: ComplianceStats
  campaigns: Array<{ id: string; name: string; control: string; status: string; cycleNumber: number | null; stats: ComplianceStats | null; pendingReview: number }>
  pendingReview: number
  unreviewedExpired: number
  selfReviewsThisMonth: number
  unresolvedPastDeadline: number
}

export async function companyDashboard(actor: SecurityActor, now: Date, db: Db = prisma): Promise<CompanyDashboard> {
  requireCapability(canViewConsole(actor))
  await applyDueExpiries({}, now, db)
  const campaigns = await db.securityCampaign.findMany({
    where: { status: { in: ['ACTIVE', 'CLOSED'] }, cycles: { some: {} } },
    include: { cycles: { orderBy: { number: 'desc' }, take: 1, include: { tasks: { select: TASK_SELECT } } } },
    orderBy: { name: 'asc' },
  })
  const latestTasks = campaigns.flatMap((campaign) => campaign.cycles[0]?.tasks ?? [])
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const [unreviewedExpired, selfReviewsThisMonth, unresolvedPastDeadline] = await Promise.all([
    db.securityTask.count({ where: { unreviewedFlag: true, cycle: { actualCloseAt: null } } }),
    db.securityAuditLog.count({ where: { selfReview: true, createdAt: { gte: monthStart } } }),
    db.securityTask.count({ where: { status: { in: ['REJECTED', 'REQUIRES_INFO'] }, deadline: { lt: now } } }),
  ])
  return {
    overall: statsOf(latestTasks),
    campaigns: campaigns.map((campaign) => {
      const cycle = campaign.cycles[0]
      return {
        id: campaign.id,
        name: campaign.name,
        control: campaign.control,
        status: campaign.status,
        cycleNumber: cycle?.number ?? null,
        stats: cycle ? statsOf(cycle.tasks) : null,
        pendingReview: cycle ? cycle.tasks.filter((task) => task.status === 'PENDING_REVIEW').length : 0,
      }
    }),
    pendingReview: latestTasks.filter((task) => task.status === 'PENDING_REVIEW').length,
    unreviewedExpired,
    selfReviewsThisMonth,
    unresolvedPastDeadline,
  }
}
