'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { EmptyState } from '@/components/composed/EmptyState'
import { TaskRow } from '@/components/projects/TaskRow'
import type { PanelTask } from '@/components/projects/TaskDetailPanel'
import {
  CheckSquare, Calendar, Clock, Inbox,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface MyTask extends PanelTask {
  project: { id: string; name: string; color: string | null }
}

export function LegacyMyTasksView() {
  const router = useRouter()
  const [tasks, setTasks] = useState<MyTask[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'todo' | 'in_progress' | 'done'>('all')

  useEffect(() => { loadTasks() }, [])

  const loadTasks = async () => {
    try {
      const res = await fetch('/api/my-tasks')
      const data = await res.json()
      setTasks(data.tasks || [])
    } catch {
      toast.error('Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }

  const handleTaskClick = (task: MyTask) => {
    router.push(`/projects/${task.project.id}`)
  }

  const filteredTasks = useMemo(() => {
    if (filter === 'all') return tasks.filter((task) => task.status !== 'DONE')
    if (filter === 'todo') return tasks.filter((task) => task.status === 'TODO')
    if (filter === 'in_progress') return tasks.filter((task) => task.status === 'IN_PROGRESS')
    return tasks.filter((task) => task.status === 'DONE')
  }, [tasks, filter])

  const grouped = useMemo(() => {
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)

    const overdue: MyTask[] = []
    const todayTasks: MyTask[] = []
    const upcoming: MyTask[] = []
    const later: MyTask[] = []
    const noDue: MyTask[] = []

    for (const task of filteredTasks) {
      if (!task.dueDate) {
        noDue.push(task)
        continue
      }
      const due = new Date(task.dueDate)
      if (due < today && task.status !== 'DONE') {
        overdue.push(task)
      } else if (due < new Date(today.getTime() + 24 * 60 * 60 * 1000)) {
        todayTasks.push(task)
      } else if (due < nextWeek) {
        upcoming.push(task)
      } else {
        later.push(task)
      }
    }

    return [
      { label: 'Overdue', tasks: overdue, color: 'text-red-400', icon: Clock },
      { label: 'Today', tasks: todayTasks, color: 'text-blue-400', icon: Calendar },
      { label: 'Upcoming', tasks: upcoming, color: 'text-emerald-400', icon: Calendar },
      { label: 'Later', tasks: later, color: 'text-muted-foreground', icon: Calendar },
      { label: 'No Due Date', tasks: noDue, color: 'text-muted-foreground/60', icon: Inbox },
    ].filter((group) => group.tasks.length > 0)
  }, [filteredTasks])

  if (loading) return <LoadingScreen message="Loading tasks..." />

  const todoCount = tasks.filter((task) => task.status === 'TODO').length
  const progressCount = tasks.filter((task) => task.status === 'IN_PROGRESS').length
  const doneCount = tasks.filter((task) => task.status === 'DONE').length

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <h1 className="text-2xl sm:text-3xl font-display font-light tracking-tight text-foreground">
          My Tasks
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {tasks.filter((task) => task.status !== 'DONE').length} tasks remaining across {new Set(tasks.map((task) => task.project.id)).size} project{new Set(tasks.map((task) => task.project.id)).size !== 1 ? 's' : ''}
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="flex gap-1 p-1 bg-muted/50 rounded-lg w-fit mb-6"
      >
        {[
          { key: 'all' as const, label: 'Active', count: todoCount + progressCount },
          { key: 'todo' as const, label: 'To Do', count: todoCount },
          { key: 'in_progress' as const, label: 'In Progress', count: progressCount },
          { key: 'done' as const, label: 'Done', count: doneCount },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
              filter === tab.key
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
            <span className="ml-1.5 opacity-60">{tab.count}</span>
          </button>
        ))}
      </motion.div>

      {filteredTasks.length === 0 ? (
        <EmptyState
          icon={<CheckSquare className="h-12 w-12" />}
          title={filter === 'done' ? 'No completed tasks yet' : 'All caught up!'}
          description={filter === 'done' ? 'Complete tasks to see them here.' : 'You have no tasks assigned to you.'}
        />
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="space-y-6"
        >
          {grouped.map((group) => {
            const GroupIcon = group.icon
            return (
              <div key={group.label}>
                <div className="flex items-center gap-2 px-2 mb-2">
                  <GroupIcon className={cn('w-4 h-4', group.color)} />
                  <h3 className={cn('text-sm font-semibold', group.color)}>
                    {group.label}
                  </h3>
                  <span className="text-xs text-muted-foreground">{group.tasks.length}</span>
                </div>
                <div className="space-y-0.5">
                  {group.tasks.map((task) => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      onClick={() => handleTaskClick(task)}
                      showProject={{ name: task.project.name, color: task.project.color }}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </motion.div>
      )}
    </div>
  )
}
