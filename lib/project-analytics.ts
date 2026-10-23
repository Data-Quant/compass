import {
  calculateProjectProgress,
  calculateTaskVariance,
  isBacklogTask,
  projectTaskCalendarDayKey,
} from './project-progress'

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_RANGE_DAYS = 731
const ON_TIME_MIN_SAMPLE = 5
const PRIORITY_ORDER = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as const
const AGING_BUCKETS = [
  { label: '1-3', max: 3 },
  { label: '4-7', max: 7 },
  { label: '8-14', max: 14 },
  { label: '15-30', max: 30 },
  { label: '30+', max: Infinity },
] as const

const DAY_LABEL = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' })
const MONTH_LABEL = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'short', year: 'numeric' })

export type AnalyticsSection = {
  id: string
  name: string
  isBacklog: boolean
  isDone: boolean
  orderIndex: number
}

export type AnalyticsTask = {
  id: string
  projectId: string
  parentTaskId: string | null
  title?: string
  status: string
  priority: string
  assigneeId: string | null
  createdAt: Date | string
  completedAt: Date | string | null
  completedLate: boolean
  dueDate: Date | string | null
  section: AnalyticsSection | null
  assistants: Array<{ userId: string; createdAt: Date | string }>
  childCount: number
}

export type AnalyticsMember = { id: string; name: string }

export type AnalyticsProject = {
  id: string
  name: string
  status: string
  tasks: AnalyticsTask[]
}

export type AnalyticsRangeKey = '30d' | '90d' | '6m' | '12m' | 'custom'
export type AnalyticsBucket = { start: string; end: string; label: string }

export type AnalyticsRange = {
  key: AnalyticsRangeKey
  from: string
  to: string
  bucket: 'day' | 'week' | 'month'
  buckets: AnalyticsBucket[]
  previous: { from: string; to: string }
}

export type OpenSplit = { overdue: number; dueSoon: number; later: number; noDate: number }
export type OnTimeRate = { onTime: number; dated: number } | null

const isoDay = (key: number) => new Date(key).toISOString().slice(0, 10)
const dayOf = (value: Date | string) => projectTaskCalendarDayKey(value)
const inSpan = (day: number | null, from: number, to: number) => day !== null && day >= from && day <= to
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)
const isActive = (task: AnalyticsTask) => !isBacklogTask(task)
const isOpen = (task: AnalyticsTask) => isActive(task) && task.status !== 'DONE'
// Parents auto-complete when their children do, so only leaves earn credit or throughput.
const isCredited = (task: AnalyticsTask) => isActive(task) && task.childCount === 0
// A reopened task has completedAt cleared, so it drops out until it is done again.
const doneDay = (task: AnalyticsTask) => (
  task.status === 'DONE' && task.completedAt ? dayOf(task.completedAt) : null
)

function mondayOf(day: number) {
  return day - ((new Date(day).getUTCDay() + 6) % 7) * DAY_MS
}

function parseDayParam(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const key = Date.parse(value)
  return Number.isNaN(key) || isoDay(key) !== value ? null : key
}

function buildBuckets(from: number, to: number, bucket: AnalyticsRange['bucket']): AnalyticsBucket[] {
  const buckets: AnalyticsBucket[] = []
  for (let start = from; start <= to;) {
    const date = new Date(start)
    const next = bucket === 'day'
      ? start + DAY_MS
      : bucket === 'week'
        ? mondayOf(start) + 7 * DAY_MS
        : Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)
    buckets.push({
      start: isoDay(start),
      end: isoDay(Math.min(next - DAY_MS, to)),
      label: (bucket === 'month' ? MONTH_LABEL : DAY_LABEL).format(date),
    })
    start = next
  }
  return buckets
}

function bucketKeys(buckets: AnalyticsBucket[]) {
  return buckets.map((bucket) => ({ ...bucket, from: Date.parse(bucket.start), to: Date.parse(bucket.end) }))
}

export function resolveAnalyticsRange(
  params: { range?: string; from?: string; to?: string },
  now: Date,
): AnalyticsRange | { error: string } {
  const today = dayOf(now)
  if (today === null) return { error: 'Invalid current date' }

  let key: AnalyticsRangeKey
  let from: number
  let to = today

  if (params.from !== undefined || params.to !== undefined) {
    const a = params.from === undefined ? null : parseDayParam(params.from)
    const b = params.to === undefined ? null : parseDayParam(params.to)
    if (a === null || b === null) return { error: 'from and to must both be dates in YYYY-MM-DD format' }
    key = 'custom'
    from = Math.min(Math.min(a, b), today)
    to = Math.min(Math.max(a, b), today)
  } else {
    key = (params.range ?? '90d') as AnalyticsRangeKey
    const date = new Date(today)
    const monthsBack = (months: number) => (
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - months, date.getUTCDate()) + DAY_MS
    )
    if (key === '30d') from = today - 29 * DAY_MS
    else if (key === '90d') from = today - 89 * DAY_MS
    else if (key === '6m') from = monthsBack(6)
    else if (key === '12m') from = monthsBack(12)
    else return { error: 'range must be one of 30d, 90d, 6m, 12m' }
  }

  const days = (to - from) / DAY_MS + 1
  if (days > MAX_RANGE_DAYS) return { error: 'Date range cannot be longer than 2 years' }

  const bucket = days <= 45 ? 'day' : days <= 210 ? 'week' : 'month'
  return {
    key,
    from: isoDay(from),
    to: isoDay(to),
    bucket,
    buckets: buildBuckets(from, to, bucket),
    previous: { from: isoDay(from - days * DAY_MS), to: isoDay(from - DAY_MS) },
  }
}

function onTimeRate(completed: AnalyticsTask[]): OnTimeRate {
  const dated = completed.filter((task) => task.dueDate)
  if (dated.length < ON_TIME_MIN_SAMPLE) return null
  return { onTime: dated.filter((task) => !task.completedLate).length, dated: dated.length }
}

function splitOpen(tasks: AnalyticsTask[], now: Date): OpenSplit {
  const today = dayOf(now) ?? 0
  const split: OpenSplit = { overdue: 0, dueSoon: 0, later: 0, noDate: 0 }
  for (const task of tasks) {
    const dueDay = task.dueDate ? dayOf(task.dueDate) : null
    if (dueDay === null) split.noDate += 1
    else if (calculateTaskVariance(task, now).isOverdue) split.overdue += 1
    else if (dueDay - today <= 7 * DAY_MS) split.dueSoon += 1
    else split.later += 1
  }
  return split
}

function isWorkingOn(task: AnalyticsTask, userId: string) {
  return task.assigneeId === userId || task.assistants.some((assistant) => assistant.userId === userId)
}

function completedIn(tasks: AnalyticsTask[], from: number, to: number) {
  return tasks.filter((task) => isCredited(task) && inSpan(doneDay(task), from, to))
}

function rangeKeys(range: AnalyticsRange) {
  return { from: Date.parse(range.from), to: Date.parse(range.to) }
}

export function buildProjectAnalytics(
  tasks: AnalyticsTask[],
  sections: AnalyticsSection[],
  members: AnalyticsMember[],
  range: AnalyticsRange,
  now: Date,
) {
  const active = tasks.filter(isActive)
  const open = active.filter(isOpen)
  const { from, to } = rangeKeys(range)
  const completed = completedIn(active, from, to)
  const buckets = bucketKeys(range.buckets)
  const names = new Map(members.map((member) => [member.id, member.name]))

  const overdue = open
    .map((task) => calculateTaskVariance(task, now))
    .filter((variance) => variance.isOverdue)

  // Burn-up matches the progress tile, so it counts every active task, parents included.
  const createdDays = active.map((task) => dayOf(task.createdAt))
  const doneDays = active.map(doneDay)
  const atOrBefore = (days: Array<number | null>, end: number) => days.filter((day) => day !== null && day <= end).length
  const burnUp = buckets.map((bucket) => ({
    start: bucket.start,
    end: bucket.end,
    label: bucket.label,
    scope: atOrBefore(createdDays, bucket.to),
    done: atOrBefore(doneDays, bucket.to),
  }))
  const pace = buckets.slice(-4)
  const paceDays = (to - pace[0].from) / DAY_MS + 1
  const paceDone = doneDays.filter((day) => inSpan(day, pace[0].from, to)).length
  const last = burnUp[burnUp.length - 1]
  const remaining = last.scope - last.done
  const weeksLeft = paceDone === 0
    ? null
    : Math.round((remaining / (paceDone / paceDays) / 7) * 10) / 10

  const credited = active.filter((task) => task.childCount === 0)
  const throughput = buckets.map((bucket) => ({
    start: bucket.start,
    end: bucket.end,
    label: bucket.label,
    completed: completed.filter((task) => inSpan(doneDay(task), bucket.from, bucket.to)).length,
    created: credited.filter((task) => inSpan(dayOf(task.createdAt), bucket.from, bucket.to)).length,
  }))

  const contribution = new Map<string, number>()
  for (const task of completed) {
    if (task.assigneeId) contribution.set(task.assigneeId, (contribution.get(task.assigneeId) ?? 0) + 1)
  }

  return {
    tiles: {
      progress: calculateProjectProgress(tasks),
      completed: {
        inRange: completed.length,
        previous: completedIn(active, Date.parse(range.previous.from), Date.parse(range.previous.to)).length,
      },
      onTime: onTimeRate(completed),
      overdue: {
        count: overdue.length,
        oldestDaysLate: overdue.reduce((max, variance) => Math.max(max, variance.daysLate), 0),
      },
    },
    burnUp: { series: burnUp, weeksLeft },
    throughput: {
      series: throughput,
      average: Math.round((completed.length / throughput.length) * 10) / 10,
    },
    aging: AGING_BUCKETS.map((bucket, index) => ({
      label: bucket.label,
      count: overdue.filter((variance) => (
        variance.daysLate <= bucket.max && variance.daysLate > (AGING_BUCKETS[index - 1]?.max ?? 0)
      )).length,
    })),
    status: sections
      .filter((section) => !section.isBacklog)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((section) => ({
        sectionId: section.id,
        name: section.name,
        count: active.filter((task) => task.section?.id === section.id).length,
      })),
    priority: PRIORITY_ORDER.map((priority) => ({
      priority,
      count: open.filter((task) => task.priority === priority).length,
    })),
    contribution: [...contribution]
      .map(([userId, count]) => ({ userId, name: names.get(userId) ?? 'Former member', count }))
      .sort(byName),
    workload: members
      .map((member) => {
        const mine = open.filter((task) => isWorkingOn(task, member.id))
        return { userId: member.id, name: member.name, total: mine.length, ...splitOpen(mine, now) }
      })
      .filter((row) => row.total > 0)
      .sort(byName),
  }
}

export function buildPersonAnalytics(tasks: AnalyticsTask[], userId: string, now: Date) {
  const today = dayOf(now) ?? 0
  const start = mondayOf(today) - 52 * 7 * DAY_MS

  const credits = tasks.flatMap((task): Array<{ task: AnalyticsTask; day: number; role: 'owner' | 'helper' }> => {
    const day = doneDay(task)
    if (!isCredited(task) || day === null) return []
    if (task.assigneeId === userId) return [{ task, day, role: 'owner' }]
    // A co-assignee added after completion gets no credit.
    const helped = task.assistants.some((assistant) => (
      assistant.userId === userId && new Date(assistant.createdAt) <= new Date(task.completedAt!)
    ))
    return helped ? [{ task, day, role: 'helper' }] : []
  })
  const inWindow = credits.filter((credit) => inSpan(credit.day, start, today))

  const heatmap = buildBuckets(start, today, 'day').map((bucket) => {
    const day = Date.parse(bucket.start)
    const owned = inWindow.filter((credit) => credit.day === day && credit.role === 'owner').length
    const helped = inWindow.filter((credit) => credit.day === day && credit.role === 'helper').length
    return { date: bucket.start, owned, helped, value: owned + 0.5 * helped }
  })
  // Levels use the person's own quartiles, so shading never compares people.
  const values = heatmap.map((cell) => cell.value).filter((value) => value > 0).sort((a, b) => a - b)
  const quartile = (p: number) => values[Math.floor((values.length - 1) * p)]
  const cuts = [quartile(0.25), quartile(0.5), quartile(0.75)]

  const open = tasks.filter((task) => isOpen(task) && isWorkingOn(task, userId))
  const byProject = new Map<string, number>()
  for (const credit of inWindow) {
    byProject.set(credit.task.projectId, (byProject.get(credit.task.projectId) ?? 0) + 1)
  }

  return {
    owned: inWindow.filter((credit) => credit.role === 'owner').length,
    helped: inWindow.filter((credit) => credit.role === 'helper').length,
    onTime: onTimeRate(inWindow.map((credit) => credit.task)),
    openNow: {
      owned: open.filter((task) => task.assigneeId === userId).length,
      helping: open.filter((task) => task.assigneeId !== userId).length,
    },
    heatmap: heatmap.map(({ value, ...cell }) => ({
      ...cell,
      level: value === 0 ? 0 : 1 + cuts.filter((cut) => value > cut).length,
    })),
    byProject: [...byProject].map(([projectId, count]) => ({ projectId, count })),
    recent: credits
      .sort((a, b) => new Date(b.task.completedAt!).getTime() - new Date(a.task.completedAt!).getTime())
      .slice(0, 20)
      .map(({ task, day, role }) => ({
        id: task.id,
        title: task.title ?? '',
        projectId: task.projectId,
        role,
        late: task.completedLate,
        completedOn: isoDay(day),
      })),
  }
}

export function buildWorkspaceAnalytics(
  projects: AnalyticsProject[],
  members: AnalyticsMember[],
  range: AnalyticsRange,
  now: Date,
) {
  const today = dayOf(now) ?? 0
  const { from, to } = rangeKeys(range)
  const weeks = buildBuckets(mondayOf(today) - 11 * 7 * DAY_MS, today, 'week')
  const weekKeys = bucketKeys(weeks)
  const all = projects.flatMap((project) => project.tasks)
  const open = all.filter(isOpen)
  const overdue = open.filter((task) => calculateTaskVariance(task, now).isOverdue)

  const rows = projects
    .map((project) => {
      const credited = project.tasks.filter(isCredited)
      return {
        projectId: project.id,
        name: project.name,
        status: project.status,
        progress: calculateProjectProgress(project.tasks).percentage,
        open: project.tasks.filter(isOpen).length,
        overdue: overdue.filter((task) => task.projectId === project.id).length,
        completed: completedIn(project.tasks, from, to).length,
        // Weekly completions, aligned with `weeks`; the stacked chart reads these too.
        sparkline: weekKeys.map((week) => (
          credited.filter((task) => inSpan(doneDay(task), week.from, week.to)).length
        )),
      }
    })
    .sort(byName)

  const completed = completedIn(all, from, to)
  return {
    tiles: {
      activeProjects: projects.filter((project) => project.status === 'ACTIVE').length,
      onHoldProjects: projects.filter((project) => project.status === 'ON_HOLD').length,
      completed: completed.length,
      onTime: onTimeRate(completed),
      overdue: overdue.length,
      projectsWithOverdue: new Set(overdue.map((task) => task.projectId)).size,
    },
    projects: rows,
    weeks,
    workload: members
      .map((member) => {
        const mine = open.filter((task) => isWorkingOn(task, member.id))
        return {
          userId: member.id,
          name: member.name,
          total: mine.length,
          byProject: rows
            .map((row) => ({ projectId: row.projectId, count: mine.filter((task) => task.projectId === row.projectId).length }))
            .filter((entry) => entry.count > 0),
        }
      })
      .filter((row) => row.total > 0)
      .sort(byName),
  }
}
