'use client'

import { useMemo, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { MyTaskRecord } from '@/lib/my-tasks/types'
import { addDays, toStartOfDay } from '@/lib/my-tasks/dates'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MyTasksCalendarViewProps {
  tasks: MyTaskRecord[]
  movingTaskId?: string | null
  onTaskClick: (task: MyTaskRecord) => void
  onMoveTaskToDate: (task: MyTaskRecord, targetDate: Date) => Promise<void> | void
}

function getMonthGrid(anchorDate: Date): Date[] {
  const monthStart = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1)
  const start = addDays(monthStart, -monthStart.getDay())
  return Array.from({ length: 42 }).map((_, index) => addDays(start, index))
}

function getWeekGrid(anchorDate: Date): Date[] {
  const start = addDays(anchorDate, -anchorDate.getDay())
  return Array.from({ length: 7 }).map((_, index) => addDays(start, index))
}

function dateKey(date: Date): string {
  return toStartOfDay(date).toISOString().slice(0, 10)
}

function occursOn(task: MyTaskRecord, date: Date): boolean {
  if (!task.startDate && !task.dueDate) return false
  const start = toStartOfDay(task.startDate ? new Date(task.startDate) : new Date(task.dueDate!))
  const end = toStartOfDay(task.dueDate ? new Date(task.dueDate) : start)
  const target = toStartOfDay(date)
  return target.getTime() >= start.getTime() && target.getTime() <= end.getTime()
}

export function MyTasksCalendarView({
  tasks,
  movingTaskId,
  onTaskClick,
  onMoveTaskToDate,
}: MyTasksCalendarViewProps) {
  const [view, setView] = useState<'month' | 'week'>('month')
  const [anchorDate, setAnchorDate] = useState(() => new Date())

  const days = useMemo(
    () => (view === 'month' ? getMonthGrid(anchorDate) : getWeekGrid(anchorDate)),
    [anchorDate, view]
  )

  const tasksByDay = useMemo(() => {
    const map = new Map<string, MyTaskRecord[]>()
    for (const day of days) map.set(dateKey(day), [])
    for (const task of tasks) {
      for (const day of days) {
        if (occursOn(task, day)) {
          const key = dateKey(day)
          map.get(key)?.push(task)
        }
      }
    }
    return map
  }, [days, tasks])

  const currentMonth = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1)

  const moveRange = (offset: number) => {
    if (view === 'month') {
      setAnchorDate(new Date(anchorDate.getFullYear(), anchorDate.getMonth() + offset, 1))
    } else {
      setAnchorDate(addDays(anchorDate, offset * 7))
    }
  }

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <CalendarDays className="w-4 h-4" />
            Calendar
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" variant={view === 'week' ? 'default' : 'outline'} onClick={() => setView('week')}>Week</Button>
            <Button size="sm" variant={view === 'month' ? 'default' : 'outline'} onClick={() => setView('month')}>Month</Button>
            <Button size="icon" variant="outline" onClick={() => moveRange(-1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="outline" onClick={() => moveRange(1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {view === 'month'
            ? currentMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
            : `${days[0]?.toLocaleDateString()} - ${days[days.length - 1]?.toLocaleDateString()}`}
        </p>
      </CardHeader>
      <CardContent>
        <div className={cn('grid gap-2', view === 'month' ? 'grid-cols-7' : 'grid-cols-7')}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="text-xs text-muted-foreground px-2 pb-1 font-medium">{day}</div>
          ))}
          {days.map((day) => {
            const key = dateKey(day)
            const dayTasks = tasksByDay.get(key) || []
            const isCurrentMonth = day.getMonth() === anchorDate.getMonth()
            return (
              <div
                key={key}
                className={cn(
                  'min-h-[110px] rounded-lg border border-border/40 bg-card/40 p-2',
                  !isCurrentMonth && view === 'month' && 'opacity-50'
                )}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  const taskId = event.dataTransfer.getData('text/task-id')
                  const task = tasks.find((item) => item.id === taskId)
                  if (task) onMoveTaskToDate(task, day)
                }}
              >
                <div className="text-xs font-medium text-muted-foreground mb-1">{day.getDate()}</div>
                <div className="space-y-1">
                  {dayTasks.slice(0, 3).map((task) => (
                    <button
                      key={`${task.id}-${key}`}
                      draggable={movingTaskId !== task.id}
                      onDragStart={(event) => {
                        event.dataTransfer.setData('text/task-id', task.id)
                      }}
                      onClick={() => onTaskClick(task)}
                      className="w-full text-left"
                    >
                      <Badge
                        variant="outline"
                        className="w-full justify-start truncate text-[10px] bg-primary/5 border-primary/20 hover:bg-primary/10"
                      >
                        {task.title}
                      </Badge>
                    </button>
                  ))}
                  {dayTasks.length > 3 && (
                    <p className="text-[10px] text-muted-foreground px-1">+{dayTasks.length - 3} more</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
