import type { MyTaskRecord, SmartBucket } from '@/lib/my-tasks/types'
import { addDays, isBetweenExclusiveInclusive, isSameOrBefore, toStartOfDay, withinLastDays } from '@/lib/my-tasks/dates'

export function getSmartBucket(task: Pick<MyTaskRecord, 'status' | 'dueDate' | 'createdAt'>, now = new Date()): SmartBucket {
  const today = toStartOfDay(now)
  const nextWeek = addDays(today, 7)

  if (task.status !== 'DONE' && task.dueDate && isSameOrBefore(task.dueDate, today)) {
    return 'DO_TODAY'
  }

  if (
    task.status !== 'DONE'
    && task.dueDate
    && isBetweenExclusiveInclusive(task.dueDate, today, nextWeek)
  ) {
    return 'DO_NEXT_WEEK'
  }

  if (task.status !== 'DONE' && withinLastDays(task.createdAt, 3, now)) {
    return 'RECENTLY_ASSIGNED'
  }

  return 'DO_LATER'
}

export function groupTasksByBucket(tasks: MyTaskRecord[], now = new Date()): Record<SmartBucket, MyTaskRecord[]> {
  return tasks.reduce(
    (acc, task) => {
      const bucket = getSmartBucket(task, now)
      acc[bucket].push(task)
      return acc
    },
    {
      RECENTLY_ASSIGNED: [],
      DO_TODAY: [],
      DO_NEXT_WEEK: [],
      DO_LATER: [],
    } as Record<SmartBucket, MyTaskRecord[]>
  )
}

export const SMART_BUCKET_LABELS: Record<SmartBucket, string> = {
  RECENTLY_ASSIGNED: 'Recently assigned',
  DO_TODAY: 'Do today',
  DO_NEXT_WEEK: 'Do next week',
  DO_LATER: 'Do later',
}
