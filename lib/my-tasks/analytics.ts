import type { MyTaskRecord, SmartBucket } from '@/lib/my-tasks/types'
import { groupTasksByBucket } from '@/lib/my-tasks/buckets'
import { addDays, toStartOfDay } from '@/lib/my-tasks/dates'

interface DashboardMetrics {
  totalCompletedTasks: number
  totalIncompleteTasks: number
  totalOverdueTasks: number
  totalTasks: number
  tasksBySmartSection: Array<{ bucket: SmartBucket; label: string; count: number }>
  tasksByCompletionStatusThisMonth: Array<{ status: string; count: number }>
  tasksByProject: Array<{ projectId: string; projectName: string; count: number }>
  taskCompletionOverTime: Array<{ date: string; completed: number; active: number }>
}

export function buildDashboardMetrics(tasks: MyTaskRecord[], now = new Date()): DashboardMetrics {
  const today = toStartOfDay(now)
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)
  const windowStart = addDays(today, -13)
  const byBucket = groupTasksByBucket(tasks, now)

  const totalCompletedTasks = tasks.filter((task) => task.status === 'DONE').length
  const totalIncompleteTasks = tasks.filter((task) => task.status !== 'DONE').length
  const totalOverdueTasks = tasks.filter(
    (task) => task.status !== 'DONE' && !!task.dueDate && toStartOfDay(task.dueDate) < today
  ).length
  const totalTasks = tasks.length

  const tasksBySmartSection = (
    Object.keys(byBucket) as SmartBucket[]
  ).map((bucket) => ({
    bucket,
    label: bucket,
    count: byBucket[bucket].length,
  }))

  const thisMonthTasks = tasks.filter((task) => toStartOfDay(task.createdAt) >= monthStart)
  const tasksByCompletionStatusThisMonth = [
    { status: 'DONE', count: thisMonthTasks.filter((task) => task.status === 'DONE').length },
    { status: 'IN_PROGRESS', count: thisMonthTasks.filter((task) => task.status === 'IN_PROGRESS').length },
    { status: 'TODO', count: thisMonthTasks.filter((task) => task.status === 'TODO').length },
  ]

  const projectMap = new Map<string, { projectName: string; count: number }>()
  for (const task of tasks) {
    const current = projectMap.get(task.project.id)
    if (current) {
      current.count += 1
    } else {
      projectMap.set(task.project.id, { projectName: task.project.name, count: 1 })
    }
  }
  const tasksByProject = Array.from(projectMap.entries()).map(([projectId, value]) => ({
    projectId,
    projectName: value.projectName,
    count: value.count,
  }))

  const taskCompletionOverTime = Array.from({ length: 14 }).map((_, index) => {
    const date = addDays(windowStart, index)
    const key = date.toISOString().slice(0, 10)
    const completed = tasks.filter(
      (task) => task.status === 'DONE' && task.dueDate && toStartOfDay(task.dueDate).toISOString().slice(0, 10) === key
    ).length
    const active = tasks.filter(
      (task) => task.status !== 'DONE' && task.dueDate && toStartOfDay(task.dueDate).toISOString().slice(0, 10) === key
    ).length
    return { date: key, completed, active }
  })

  return {
    totalCompletedTasks,
    totalIncompleteTasks,
    totalOverdueTasks,
    totalTasks,
    tasksBySmartSection,
    tasksByCompletionStatusThisMonth,
    tasksByProject,
    taskCompletionOverTime,
  }
}
