import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildPersonAnalytics,
  buildProjectAnalytics,
  buildWorkspaceAnalytics,
  resolveAnalyticsRange,
  type AnalyticsRange,
  type AnalyticsSection,
  type AnalyticsTask,
} from '../lib/project-analytics'

// 12:00 in Karachi on Friday 23 Oct 2026.
const NOW = new Date('2026-10-23T07:00:00Z')

const TODO: AnalyticsSection = { id: 's-todo', name: 'To do', isBacklog: false, isDone: false, orderIndex: 1 }
const DONE: AnalyticsSection = { id: 's-done', name: 'Done', isBacklog: false, isDone: true, orderIndex: 2 }
const BACKLOG: AnalyticsSection = { id: 's-back', name: 'Backlog', isBacklog: true, isDone: false, orderIndex: 0 }

let seq = 0
function task(overrides: Partial<AnalyticsTask> = {}): AnalyticsTask {
  const done = overrides.completedAt != null
  return {
    id: `t${++seq}`,
    projectId: 'p1',
    parentTaskId: null,
    status: done ? 'DONE' : 'TODO',
    priority: 'MEDIUM',
    assigneeId: 'u1',
    createdAt: new Date('2026-09-01T06:00:00Z'),
    completedAt: null,
    completedLate: false,
    dueDate: null,
    section: done ? DONE : TODO,
    assistants: [],
    childCount: 0,
    ...overrides,
  }
}

function range(params: Parameters<typeof resolveAnalyticsRange>[0] = {}): AnalyticsRange {
  const resolved = resolveAnalyticsRange(params, NOW)
  if ('error' in resolved) throw new Error(resolved.error)
  return resolved
}

const project = (tasks: AnalyticsTask[], r = range({ range: '30d' })) => (
  buildProjectAnalytics(tasks, [DONE, BACKLOG, TODO], [{ id: 'u2', name: 'Bob' }, { id: 'u1', name: 'Alice' }], r, NOW)
)

test('range defaults to 90d grouped by week starting Monday', () => {
  const r = range()
  assert.equal(r.key, '90d')
  assert.equal(r.from, '2026-07-26')
  assert.equal(r.to, '2026-10-23')
  assert.equal(r.bucket, 'week')
  assert.deepEqual(r.buckets[0], { start: '2026-07-26', end: '2026-07-26', label: '26 Jul' })
  assert.deepEqual(r.buckets[1], { start: '2026-07-27', end: '2026-08-02', label: '27 Jul' })
  assert.equal(r.buckets.at(-1)?.end, '2026-10-23')
  assert.deepEqual(r.previous, { from: '2026-04-27', to: '2026-07-25' })
})

test('range presets pick day, week and month grouping', () => {
  assert.equal(range({ range: '30d' }).bucket, 'day')
  assert.equal(range({ range: '30d' }).buckets.length, 30)
  assert.equal(range({ range: '6m' }).bucket, 'week')
  const year = range({ range: '12m' })
  assert.equal(year.bucket, 'month')
  assert.equal(year.from, '2025-10-24')
  assert.deepEqual(year.buckets[0], { start: '2025-10-24', end: '2025-10-31', label: 'Oct 2025' })
  assert.equal(year.buckets.length, 13)
})

test('custom range swaps reversed dates, clamps to today and groups by span', () => {
  const r = range({ from: '2026-12-31', to: '2026-10-01' })
  assert.equal(r.key, 'custom')
  assert.equal(r.from, '2026-10-01')
  assert.equal(r.to, '2026-10-23')
  assert.equal(r.bucket, 'day')
  assert.equal(range({ from: '2026-09-08', to: '2026-10-23' }).bucket, 'week') // 46 days
  assert.equal(range({ from: '2026-03-28', to: '2026-10-23' }).bucket, 'week') // 210 days
  assert.equal(range({ from: '2026-03-27', to: '2026-10-23' }).bucket, 'month') // 211 days
})

test('range rejects bad input and spans over 2 years', () => {
  assert.ok('error' in resolveAnalyticsRange({ range: '7d' }, NOW))
  assert.ok('error' in resolveAnalyticsRange({ from: '2026-02-30', to: '2026-03-01' }, NOW))
  assert.ok('error' in resolveAnalyticsRange({ from: '2026-1-1', to: '2026-03-01' }, NOW))
  assert.ok('error' in resolveAnalyticsRange({ from: '2026-01-01' }, NOW))
  assert.ok('error' in resolveAnalyticsRange({ from: '2024-10-01', to: '2026-10-23' }, NOW))
  assert.ok(!('error' in resolveAnalyticsRange({ from: '2024-10-23', to: '2026-10-23' }, NOW)))
})

test('Karachi day edges decide the bucket', () => {
  const r = range({ range: '30d' })
  const result = project([
    task({ completedAt: new Date('2026-10-22T20:30:00Z') }), // 23 Oct 01:30 in Karachi
    task({ completedAt: new Date('2026-10-22T18:59:00Z') }), // 22 Oct 23:59 in Karachi
  ], r)
  const series = result.throughput.series
  assert.equal(series.at(-1)?.start, '2026-10-23')
  assert.equal(series.at(-1)?.completed, 1)
  assert.equal(series.at(-2)?.completed, 1)
})

test('backlog tasks are excluded everywhere', () => {
  const backlog = { section: BACKLOG, dueDate: new Date('2026-10-01T00:00:00Z') }
  const result = project([
    task(backlog),
    task({ ...backlog, completedAt: new Date('2026-10-20T06:00:00Z'), status: 'DONE' }),
  ])
  assert.deepEqual(result.tiles.progress, { completed: 0, total: 0, percentage: null })
  assert.equal(result.tiles.completed.inRange, 0)
  assert.equal(result.tiles.overdue.count, 0)
  assert.equal(result.burnUp.series.at(-1)?.scope, 0)
  assert.deepEqual(result.status.map((s) => s.name), ['To do', 'Done'])
  assert.equal(result.workload.length, 0)

  const person = buildPersonAnalytics([task({ ...backlog, completedAt: new Date('2026-10-20T06:00:00Z'), status: 'DONE' })], 'u1', NOW)
  assert.equal(person.owned, 0)
})

test('only leaf tasks earn throughput and credit', () => {
  const at = new Date('2026-10-20T06:00:00Z')
  const tasks = [task({ completedAt: at, childCount: 2 }), task({ completedAt: at, parentTaskId: 'x' })]
  const result = project(tasks)
  assert.equal(result.tiles.completed.inRange, 1)
  assert.equal(result.contribution[0].count, 1)
  assert.equal(result.burnUp.series.at(-1)?.done, 2) // burn-up matches progress, parents included
  assert.equal(buildPersonAnalytics(tasks, 'u1', NOW).owned, 1)
})

test('co-assignee counts as helped only if added by completion', () => {
  const at = new Date('2026-10-20T06:00:00Z')
  const tasks = [
    task({ completedAt: at, assistants: [{ userId: 'u2', createdAt: at }] }),
    task({ completedAt: at, assistants: [{ userId: 'u2', createdAt: new Date('2026-10-20T06:00:01Z') }] }),
  ]
  const person = buildPersonAnalytics(tasks, 'u2', NOW)
  assert.equal(person.helped, 1)
  assert.equal(person.owned, 0)
  assert.equal(person.recent.length, 1)
  assert.equal(person.recent[0].role, 'helper')
})

test('late tasks count as completed; undated tasks stay out of on-time; n<5 is null', () => {
  const at = new Date('2026-10-20T06:00:00Z')
  const due = new Date('2026-10-25T00:00:00Z')
  const dated = [
    task({ completedAt: at, dueDate: due, completedLate: true }),
    ...Array.from({ length: 3 }, () => task({ completedAt: at, dueDate: due })),
  ]
  const undated = task({ completedAt: at })
  assert.equal(project([...dated, undated]).tiles.onTime, null)
  assert.equal(project([...dated, undated]).tiles.completed.inRange, 5)

  const five = [...dated, task({ completedAt: at, dueDate: due }), undated]
  assert.deepEqual(project(five).tiles.onTime, { onTime: 4, dated: 5 })
  assert.equal(project(five).tiles.completed.inRange, 6)
  assert.equal(buildPersonAnalytics(five, 'u1', NOW).owned, 6)
  assert.deepEqual(buildPersonAnalytics(five, 'u1', NOW).onTime, { onTime: 4, dated: 5 })
})

test('a reopened task is not counted', () => {
  const reopened = task({ status: 'TODO', completedAt: null, completedLate: true })
  const result = project([reopened])
  assert.equal(result.tiles.completed.inRange, 0)
  assert.equal(result.burnUp.series.at(-1)?.done, 0)
  assert.equal(buildPersonAnalytics([reopened], 'u1', NOW).owned, 0)
})

test('project analytics tiles, aging, donuts and workload', () => {
  const tasks = [
    task({ dueDate: new Date('2026-10-21T00:00:00Z'), priority: 'HIGH' }), // 2 days late
    task({ dueDate: new Date('2026-09-01T00:00:00Z'), assigneeId: 'u2' }), // 52 days late
    task({ dueDate: new Date('2026-10-28T00:00:00Z'), assigneeId: null, assistants: [{ userId: 'u2', createdAt: NOW }] }),
    task({ dueDate: new Date('2026-12-01T00:00:00Z'), assigneeId: 'u2' }),
    task({ assigneeId: null }),
    task({ completedAt: new Date('2026-10-10T06:00:00Z'), assigneeId: 'u2' }),
    task({ completedAt: new Date('2026-10-11T06:00:00Z'), assigneeId: null }),
    task({ completedAt: new Date('2026-09-10T06:00:00Z') }), // previous period
  ]
  const result = project(tasks)
  assert.equal(result.tiles.progress.percentage, 38)
  assert.deepEqual(result.tiles.completed, { inRange: 2, previous: 1 })
  assert.deepEqual(result.tiles.overdue, { count: 2, oldestDaysLate: 52 })
  assert.deepEqual(result.aging.map((a) => a.count), [1, 0, 0, 0, 1])
  assert.deepEqual(result.status, [
    { sectionId: 's-todo', name: 'To do', count: 5 },
    { sectionId: 's-done', name: 'Done', count: 3 },
  ])
  assert.deepEqual(result.priority, [
    { priority: 'URGENT', count: 0 },
    { priority: 'HIGH', count: 1 },
    { priority: 'MEDIUM', count: 4 },
    { priority: 'LOW', count: 0 },
  ])
  assert.deepEqual(result.contribution, [{ userId: 'u2', name: 'Bob', count: 1 }])
  assert.deepEqual(result.workload, [
    { userId: 'u1', name: 'Alice', total: 1, overdue: 1, dueSoon: 0, later: 0, noDate: 0 },
    { userId: 'u2', name: 'Bob', total: 3, overdue: 1, dueSoon: 1, later: 1, noDate: 0 },
  ])
  assert.equal(result.throughput.average, Math.round((2 / 30) * 10) / 10)
})

test('burn-up projects weeks left from the last 28 days, whatever the bucket size', () => {
  const tasks = [
    task({ completedAt: new Date('2026-10-22T06:00:00Z') }),
    task({ completedAt: new Date('2026-10-23T06:00:00Z') }),
    task({ completedAt: new Date('2026-09-26T06:00:00Z') }), // day 28 back: inside
    task({ completedAt: new Date('2026-09-25T06:00:00Z') }), // day 29 back: outside
    ...Array.from({ length: 4 }, () => task()),
  ]
  for (const params of [{ range: '30d' }, { range: '12m' }]) {
    const result = project(tasks, range(params))
    // 3 done in 28 days = 0.75/week, 4 left = 5.3 weeks.
    assert.equal(result.burnUp.weeksLeft, 5.3, params.range)
  }
  assert.deepEqual(project(tasks, range({ range: '30d' })).burnUp.series.at(-1), {
    start: '2026-10-23', end: '2026-10-23', label: '23 Oct', scope: 8, done: 4,
  })
  assert.equal(project([task()], range({ range: '30d' })).burnUp.weeksLeft, null)
})

test('6m from the 31st clamps to the last day of the target month', () => {
  const r = resolveAnalyticsRange({ range: '6m' }, new Date('2026-03-31T07:00:00Z'))
  assert.ok(!('error' in r))
  assert.equal(r.from, '2025-10-01')
  assert.equal(r.bucket, 'week')
})

test('a 45-day custom range groups by day, 46 by week', () => {
  const day45 = range({ from: '2026-09-09', to: '2026-10-23' })
  assert.equal(day45.bucket, 'day')
  assert.equal(day45.buckets.length, 45)
  assert.equal(range({ from: '2026-09-08', to: '2026-10-23' }).bucket, 'week')
})

test('created counts every active task, completed only leaves', () => {
  const at = new Date('2026-10-23T06:00:00Z')
  const result = project([
    task({ createdAt: at, childCount: 2 }),
    task({ createdAt: at, completedAt: at }),
    task({ createdAt: at, section: BACKLOG }),
  ])
  assert.deepEqual(result.throughput.series.at(-1), {
    start: '2026-10-23', end: '2026-10-23', label: '23 Oct', completed: 1, created: 2,
  })
})

test('sorting is by name, never by count', () => {
  const at = new Date('2026-10-20T06:00:00Z')
  const result = project([
    task({ completedAt: at, assigneeId: 'u2' }),
    task({ completedAt: at, assigneeId: 'u2' }),
    task({ completedAt: at, assigneeId: 'u1' }),
  ])
  assert.deepEqual(result.contribution.map((c) => c.name), ['Alice', 'Bob'])
})

test('person heatmap covers 53 weeks and uses own quartiles', () => {
  const day = (iso: string) => new Date(`${iso}T06:00:00Z`)
  const tasks = [
    task({ completedAt: day('2026-10-23') }),
    task({ completedAt: day('2026-10-22') }),
    task({ completedAt: day('2026-10-22') }),
    task({ completedAt: day('2026-10-21'), assigneeId: 'u2', assistants: [{ userId: 'u1', createdAt: day('2026-10-01') }] }),
    ...Array.from({ length: 4 }, () => task({ completedAt: day('2026-10-20') })),
    task({ dueDate: day('2026-10-30') }),
    task({ assigneeId: 'u2', assistants: [{ userId: 'u1', createdAt: NOW }] }),
  ]
  const person = buildPersonAnalytics(tasks, 'u1', NOW)
  assert.equal(person.heatmap[0].date, '2025-10-20') // a Monday, 52 weeks before this week's Monday
  assert.equal(person.heatmap.at(-1)?.date, '2026-10-23')
  assert.equal(person.heatmap.length, 52 * 7 + 5)
  const cell = (date: string) => person.heatmap.find((c) => c.date === date)
  assert.deepEqual(cell('2026-10-21'), { date: '2026-10-21', owned: 0, helped: 1, level: 1 })
  assert.equal(cell('2026-10-23')?.level, 2)
  assert.equal(cell('2026-10-22')?.level, 3)
  assert.equal(cell('2026-10-20')?.level, 4)
  assert.equal(cell('2026-10-19')?.level, 0)
  assert.equal(person.owned, 7)
  assert.equal(person.helped, 1)
  assert.deepEqual(person.openNow, { owned: 1, helping: 1 })
  assert.deepEqual(person.byProject, [{ projectId: 'p1', count: 8 }])
  assert.equal(person.recent[0].completedOn, '2026-10-23')
  assert.equal(person.recent.length, 8)
})

test('workspace analytics per project, weeks and workload', () => {
  const at = new Date('2026-10-20T06:00:00Z')
  const late = new Date('2026-10-01T00:00:00Z')
  const result = buildWorkspaceAnalytics([
    { id: 'p2', name: 'Zeta', status: 'ON_HOLD', tasks: [task({ projectId: 'p2', dueDate: late, assigneeId: 'u2' })] },
    { id: 'p1', name: 'Alpha', status: 'ACTIVE', tasks: [task({ completedAt: at }), task({ assigneeId: 'u2' }), task({ section: BACKLOG, assigneeId: 'u2' })] },
  ], [{ id: 'u2', name: 'Bob' }, { id: 'u1', name: 'Alice' }], range(), NOW)

  assert.deepEqual(result.projects.map((p) => p.name), ['Alpha', 'Zeta'])
  assert.deepEqual(result.projects[0], {
    projectId: 'p1', name: 'Alpha', status: 'ACTIVE', progress: 50, open: 1, overdue: 0, completed: 1,
    sparkline: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
    series: new Array(range().buckets.length).fill(0).map((_, i, all) => (i === all.length - 1 ? 1 : 0)),
  })
  assert.equal(result.buckets.length, range().buckets.length)
  assert.equal(result.weeks.length, 12)
  assert.equal(result.weeks[0].start, '2026-08-03')
  assert.deepEqual(result.tiles, { activeProjects: 1, onHoldProjects: 1, completed: 1, onTime: null, overdue: 1, projectsWithOverdue: 1 })
  assert.deepEqual(result.workload, [
    { userId: 'u2', name: 'Bob', total: 2, byProject: [{ projectId: 'p1', count: 1 }, { projectId: 'p2', count: 1 }] },
  ])
})
