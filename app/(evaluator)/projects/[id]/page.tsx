'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { useLayoutUser } from '@/components/layout/SidebarLayout'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { UserAvatar } from '@/components/composed/UserAvatar'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { EmptyState } from '@/components/composed/EmptyState'
import {
  Plus,
  CheckCircle2,
  Circle,
  Clock,
  Trash2,
  CalendarDays,
  Flag,
  ListTodo,
} from 'lucide-react'

interface Task {
  id: string
  title: string
  description: string | null
  status: 'TODO' | 'IN_PROGRESS' | 'DONE'
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  assignee: { id: string; name: string } | null
  dueDate: string | null
  completedAt: string | null
}

interface Project {
  id: string
  name: string
  description: string | null
  status: string
  owner: { id: string; name: string }
  members: Array<{ user: { id: string; name: string }; role: string }>
  tasks: Task[]
}

const PRIORITY_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  LOW: { label: 'Low', color: 'text-muted-foreground', icon: '○' },
  MEDIUM: { label: 'Medium', color: 'text-amber-500', icon: '◑' },
  HIGH: { label: 'High', color: 'text-orange-500', icon: '●' },
  URGENT: { label: 'Urgent', color: 'text-red-500', icon: '◉' },
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  TODO: <Circle className="h-4 w-4 text-muted-foreground" />,
  IN_PROGRESS: <Clock className="h-4 w-4 text-blue-500" />,
  DONE: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
}

const STATUS_LABELS = ['TODO', 'IN_PROGRESS', 'DONE'] as const

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const user = useLayoutUser()
  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskPriority, setNewTaskPriority] = useState('MEDIUM')
  const [adding, setAdding] = useState(false)
  const [filter, setFilter] = useState<string>('ALL')

  useEffect(() => {
    loadProject()
  }, [id])

  const loadProject = async () => {
    try {
      const res = await fetch(`/api/projects/${id}`)
      const data = await res.json()
      if (data.project) setProject(data.project)
    } catch {
      toast.error('Failed to load project')
    } finally {
      setLoading(false)
    }
  }

  const addTask = async () => {
    if (!newTaskTitle.trim()) return
    setAdding(true)
    try {
      const res = await fetch(`/api/projects/${id}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTaskTitle, priority: newTaskPriority }),
      })
      const data = await res.json()
      if (data.success) {
        setNewTaskTitle('')
        setNewTaskPriority('MEDIUM')
        loadProject()
      } else {
        toast.error(data.error || 'Failed to add task')
      }
    } catch {
      toast.error('Failed to add task')
    } finally {
      setAdding(false)
    }
  }

  const updateTaskStatus = async (taskId: string, status: string) => {
    try {
      await fetch(`/api/projects/${id}/tasks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId, status }),
      })
      loadProject()
    } catch {
      toast.error('Failed to update task')
    }
  }

  const deleteTask = async (taskId: string) => {
    try {
      await fetch(`/api/projects/${id}/tasks?taskId=${taskId}`, { method: 'DELETE' })
      loadProject()
    } catch {
      toast.error('Failed to delete task')
    }
  }

  if (loading) return <LoadingScreen message="Loading project..." />
  if (!project) return <EmptyState icon={<ListTodo className="h-12 w-12" />} title="Project not found" />

  const tasks = project.tasks || []
  const filteredTasks = filter === 'ALL' ? tasks : tasks.filter((t) => t.status === filter)
  const todoCount = tasks.filter((t) => t.status === 'TODO').length
  const inProgressCount = tasks.filter((t) => t.status === 'IN_PROGRESS').length
  const doneCount = tasks.filter((t) => t.status === 'DONE').length

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto">
      {/* Project header */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-display font-light tracking-tight text-foreground">
          {project.name}
        </h1>
        {project.description && (
          <p className="text-muted-foreground mt-1">{project.description}</p>
        )}

        {/* Stats bar */}
        <div className="flex flex-wrap gap-4 mt-4">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Circle className="h-3.5 w-3.5" /> {todoCount} To Do
          </div>
          <div className="flex items-center gap-1.5 text-sm text-blue-500">
            <Clock className="h-3.5 w-3.5" /> {inProgressCount} In Progress
          </div>
          <div className="flex items-center gap-1.5 text-sm text-emerald-500">
            <CheckCircle2 className="h-3.5 w-3.5" /> {doneCount} Done
          </div>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground ml-auto">
            {project.members.slice(0, 5).map((m) => (
              <UserAvatar key={m.user.id} name={m.user.name} size="xs" className="ring-2 ring-background" />
            ))}
          </div>
        </div>
      </motion.div>

      {/* Add task */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex gap-2">
              <Input
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="Add a task..."
                className="flex-1"
                onKeyDown={(e) => e.key === 'Enter' && addTask()}
              />
              <Select value={newTaskPriority} onValueChange={setNewTaskPriority}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">Low</SelectItem>
                  <SelectItem value="MEDIUM">Medium</SelectItem>
                  <SelectItem value="HIGH">High</SelectItem>
                  <SelectItem value="URGENT">Urgent</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={addTask} disabled={adding || !newTaskTitle.trim()}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 p-1 bg-muted rounded-lg w-fit">
        {[{ key: 'ALL', label: `All (${tasks.length})` }, ...STATUS_LABELS.map((s) => ({
          key: s,
          label: `${s === 'IN_PROGRESS' ? 'In Progress' : s === 'TODO' ? 'To Do' : 'Done'} (${tasks.filter((t) => t.status === s).length})`,
        }))].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              filter === tab.key
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Task list */}
      <div className="space-y-2">
        {filteredTasks.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-sm text-muted-foreground">No tasks {filter !== 'ALL' ? 'in this status' : 'yet'}.</p>
            </CardContent>
          </Card>
        ) : (
          filteredTasks.map((task, i) => {
            const pri = PRIORITY_CONFIG[task.priority] || PRIORITY_CONFIG.MEDIUM
            return (
              <motion.div
                key={task.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
              >
                <Card className={`transition-colors ${task.status === 'DONE' ? 'opacity-60' : ''}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      {/* Status toggle */}
                      <button
                        onClick={() => {
                          const next = task.status === 'TODO' ? 'IN_PROGRESS' : task.status === 'IN_PROGRESS' ? 'DONE' : 'TODO'
                          updateTaskStatus(task.id, next)
                        }}
                        className="shrink-0"
                        title={`Status: ${task.status}`}
                      >
                        {STATUS_ICON[task.status]}
                      </button>

                      {/* Title */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${task.status === 'DONE' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                          {task.title}
                        </p>
                        {task.description && (
                          <p className="text-xs text-muted-foreground truncate">{task.description}</p>
                        )}
                      </div>

                      {/* Meta */}
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-xs ${pri.color}`} title={`Priority: ${pri.label}`}>
                          <Flag className="h-3.5 w-3.5" />
                        </span>

                        {task.dueDate && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        )}

                        {task.assignee && (
                          <UserAvatar name={task.assignee.name} size="xs" />
                        )}

                        <button
                          onClick={() => deleteTask(task.id)}
                          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })
        )}
      </div>
    </div>
  )
}
