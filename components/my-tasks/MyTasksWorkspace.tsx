'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { MyTasksTabs } from '@/components/my-tasks/MyTasksTabs'
import { MyTasksListView } from '@/components/my-tasks/views/ListView'
import { MyTasksBoardView } from '@/components/my-tasks/views/BoardView'
import { MyTasksCalendarView } from '@/components/my-tasks/views/CalendarView'
import { MyTasksDashboardView } from '@/components/my-tasks/views/DashboardView'
import { MyTasksFilesView } from '@/components/my-tasks/views/FilesView'
import type { MyTaskRecord, SmartBucket } from '@/lib/my-tasks/types'
import { addDays, dateDiffInDays, toIsoDate } from '@/lib/my-tasks/dates'
import { Search } from 'lucide-react'

interface ProjectOption {
  id: string
  name: string
}

export function MyTasksWorkspace() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('list')
  const [loading, setLoading] = useState(true)
  const [tasks, setTasks] = useState<MyTaskRecord[]>([])
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [search, setSearch] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState<string>('ALL')
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'ALL' | 'TODO' | 'IN_PROGRESS' | 'DONE'>('ACTIVE')
  const [movingTaskId, setMovingTaskId] = useState<string | null>(null)

  const projectIdParam = selectedProjectId === 'ALL' ? null : selectedProjectId

  const loadProjects = async () => {
    try {
      const res = await fetch('/api/projects')
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to load projects')
      setProjects((data.projects || []).map((project: any) => ({ id: project.id, name: project.name })))
    } catch {
      setProjects([])
    }
  }

  const loadTasks = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        status: statusFilter,
        includeDone: statusFilter === 'DONE' || statusFilter === 'ALL' ? 'true' : 'false',
        sort: 'due_asc',
      })
      if (search.trim()) params.set('q', search.trim())
      if (projectIdParam) params.set('projectId', projectIdParam)

      const response = await fetch(`/api/my-tasks?${params.toString()}`)
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error || 'Failed to load tasks')
      setTasks(payload.tasks || [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProjects()
  }, [])

  useEffect(() => {
    const timeout = setTimeout(() => {
      loadTasks()
    }, 200)
    return () => clearTimeout(timeout)
  }, [search, projectIdParam, statusFilter])

  const handleTaskClick = (task: MyTaskRecord) => {
    router.push(`/projects/${task.project.id}`)
  }

  const patchTask = async (taskId: string, updates: Record<string, any>) => {
    const response = await fetch(`/api/my-tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload?.error || 'Failed to update task')
    return payload.task as MyTaskRecord
  }

  const handleMoveTaskToBucket = async (task: MyTaskRecord, targetBucket: SmartBucket) => {
    try {
      setMovingTaskId(task.id)
      const today = new Date()
      const updates: Record<string, any> = {}
      if (targetBucket === 'DO_TODAY') updates.dueDate = toIsoDate(today)
      if (targetBucket === 'DO_NEXT_WEEK') updates.dueDate = toIsoDate(addDays(today, 7))
      if (targetBucket === 'DO_LATER' || targetBucket === 'RECENTLY_ASSIGNED') updates.dueDate = null
      await patchTask(task.id, updates)
      await loadTasks()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to move task')
    } finally {
      setMovingTaskId(null)
    }
  }

  const handleMoveTaskToDate = async (task: MyTaskRecord, targetDate: Date) => {
    try {
      setMovingTaskId(task.id)
      const updates: Record<string, any> = {}
      if (task.startDate && task.dueDate) {
        const duration = dateDiffInDays(task.startDate, task.dueDate)
        updates.startDate = toIsoDate(targetDate)
        updates.dueDate = toIsoDate(addDays(targetDate, duration))
      } else if (task.dueDate) {
        updates.dueDate = toIsoDate(targetDate)
      } else if (task.startDate) {
        updates.startDate = toIsoDate(targetDate)
      } else {
        updates.dueDate = toIsoDate(targetDate)
      }

      await patchTask(task.id, updates)
      await loadTasks()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update task date')
    } finally {
      setMovingTaskId(null)
    }
  }

  const activeTaskCount = useMemo(
    () => tasks.filter((task) => task.status !== 'DONE').length,
    [tasks]
  )

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1300px] mx-auto space-y-4">
      <div>
        <h1 className="text-2xl sm:text-3xl font-display font-light tracking-tight text-foreground">My Tasks</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {activeTaskCount} active tasks across {new Set(tasks.map((task) => task.project.id)).size} projects
        </p>
      </div>

      <Card className="border-border/60">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search task, description, or project..."
                className="pl-9"
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-3 sm:w-auto">
              <Select value={statusFilter} onValueChange={(value: any) => setStatusFilter(value)}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="ALL">All statuses</SelectItem>
                  <SelectItem value="TODO">To do</SelectItem>
                  <SelectItem value="IN_PROGRESS">In progress</SelectItem>
                  <SelectItem value="DONE">Done</SelectItem>
                </SelectContent>
              </Select>

              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger className="w-full sm:w-[220px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All projects</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{tasks.length} tasks loaded</p>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <MyTasksTabs value={activeTab} />
        <TabsContent value="list">
          {loading ? (
            <Card><CardContent className="p-8 text-sm text-muted-foreground">Loading tasks...</CardContent></Card>
          ) : (
            <MyTasksListView tasks={tasks} onTaskClick={handleTaskClick} />
          )}
        </TabsContent>
        <TabsContent value="board">
          {loading ? (
            <Card><CardContent className="p-8 text-sm text-muted-foreground">Loading board...</CardContent></Card>
          ) : (
            <MyTasksBoardView
              tasks={tasks}
              onTaskClick={handleTaskClick}
              onMoveTask={handleMoveTaskToBucket}
              movingTaskId={movingTaskId}
            />
          )}
        </TabsContent>
        <TabsContent value="calendar">
          {loading ? (
            <Card><CardContent className="p-8 text-sm text-muted-foreground">Loading calendar...</CardContent></Card>
          ) : (
            <MyTasksCalendarView
              tasks={tasks}
              onTaskClick={handleTaskClick}
              onMoveTaskToDate={handleMoveTaskToDate}
              movingTaskId={movingTaskId}
            />
          )}
        </TabsContent>
        <TabsContent value="dashboard">
          <MyTasksDashboardView projectId={projectIdParam} />
        </TabsContent>
        <TabsContent value="files">
          <MyTasksFilesView projects={projects} selectedProjectId={projectIdParam} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
