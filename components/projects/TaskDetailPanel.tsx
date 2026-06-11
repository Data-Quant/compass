'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle
} from '@/components/ui/sheet'
import { Calendar as DatePicker } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { UserAvatar } from '@/components/composed/UserAvatar'
import {
  X, Trash2, Calendar as CalendarIcon, Flag, Tag, Users, MessageSquare,
  Send, ChevronDown, Check, GitBranch, Plus, UserRoundCheck, Image as ImageIcon,
  History, Loader2
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

/* ─── Types ───────────────────────────────────────────────────────────── */

interface Label {
  id: string
  name: string
  color: string
}

interface LabelAssignment {
  label: Label
}

interface TaskUser {
  id: string
  name: string
}

export interface ProjectStatusSection {
  id: string
  name: string
  color: string
  canonicalStatus: 'TODO' | 'IN_PROGRESS' | 'DONE'
  isDefault: boolean
  isDone: boolean
  orderIndex: number
}

interface Comment {
  id: string
  content: string
  createdAt: string
  author: TaskUser
}

interface TaskActivity {
  id: string
  summary: string
  kind: string
  createdAt: string
  actor: TaskUser | null
}

interface ParentTaskSummary {
  id: string
  title: string
  assigneeId: string | null
  assignee: TaskUser | null
}

interface ChildTaskSummary {
  id: string
  title: string
  status: 'TODO' | 'IN_PROGRESS' | 'DONE'
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  assigneeId: string | null
  dueDate: string | null
  sectionId: string | null
  parentTaskId: string | null
  assignee: TaskUser | null
  section?: Pick<ProjectStatusSection, 'id' | 'name' | 'color' | 'canonicalStatus' | 'isDone'> | null
  _count: { comments: number }
}

interface TaskAssistant {
  id: string
  user: TaskUser
}

export interface PanelTask {
  id: string
  title: string
  description: string | null
  status: 'TODO' | 'IN_PROGRESS' | 'DONE'
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  assigneeId: string | null
  assignee: TaskUser | null
  startDate: string | null
  dueDate: string | null
  sectionId: string | null
  section: ProjectStatusSection | null
  orderIndex: number
  parentTaskId?: string | null
  parentTask?: ParentTaskSummary | null
  childTasks?: ChildTaskSummary[]
  assistants?: TaskAssistant[]
  labelAssignments: LabelAssignment[]
  _count: { comments: number }
}

interface TaskDetailPanelProps {
  task: PanelTask | null
  projectId: string
  members: { id: string; name: string; role: string }[]
  sections: ProjectStatusSection[]
  labels: Label[]
  open: boolean
  onClose: () => void
  onTaskUpdate: (task: any) => void
  onTaskDelete: (taskId: string) => void
  onTasksChange?: () => Promise<void> | void
  onOpenTask?: (taskId: string) => void
}

const PRIORITY_CONFIG: Record<string, { color: string; label: string }> = {
  LOW: { color: 'text-slate-400', label: 'Low' },
  MEDIUM: { color: 'text-blue-400', label: 'Medium' },
  HIGH: { color: 'text-orange-400', label: 'High' },
  URGENT: { color: 'text-red-500', label: 'Urgent' },
}

const STATUS_CONFIG: Record<string, { color: string; label: string; bg: string }> = {
  TODO: { color: 'text-slate-400', bg: 'bg-slate-400/10', label: 'To Do' },
  IN_PROGRESS: { color: 'text-blue-400', bg: 'bg-blue-400/10', label: 'In Progress' },
  DONE: { color: 'text-emerald-400', bg: 'bg-emerald-400/10', label: 'Done' },
}

const STATUS_HEX: Record<string, string> = {
  TODO: '#94a3b8',
  IN_PROGRESS: '#60a5fa',
  DONE: '#22c55e',
}

function toLocalDateValue(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseTaskDate(value: string | null | undefined) {
  if (!value) return undefined
  const datePart = value.includes('T') ? value.split('T')[0] : value
  const date = new Date(`${datePart}T00:00:00`)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function formatTaskDate(value: string | null | undefined) {
  const date = parseTaskDate(value)
  if (!date) return 'No deadline'
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function statusLabelForTask(task: Pick<PanelTask, 'status' | 'section'>) {
  return task.section?.name || STATUS_CONFIG[task.status]?.label || task.status
}

function statusColorForSection(section: ProjectStatusSection | Pick<ProjectStatusSection, 'color' | 'canonicalStatus'> | null | undefined, status?: string) {
  return section?.color || STATUS_HEX[section?.canonicalStatus || status || 'IN_PROGRESS'] || STATUS_HEX.IN_PROGRESS
}

function appendMarkdownImage(content: string, url: string) {
  const prefix = content.trim() ? `${content.trimEnd()}\n\n` : ''
  return `${prefix}![image](${url})`
}

function normalizeLinkHref(value: string) {
  return value.startsWith('http://') || value.startsWith('https://') ? value : `https://${value}`
}

function renderLinkedText(text: string, keyPrefix: string) {
  const markdownLinkRegex = /\[([^\]]+)\]\(((?:https?:\/\/|www\.)[^)\s]+)\)/g
  const nodes: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  const renderBareLinks = (segment: string, segmentKey: string) => {
    const bareUrlRegex = /\b((?:https?:\/\/|www\.)[^\s<>()]+)/g
    const parts: React.ReactNode[] = []
    let segmentLastIndex = 0
    let bareMatch: RegExpExecArray | null

    while ((bareMatch = bareUrlRegex.exec(segment)) !== null) {
      if (bareMatch.index > segmentLastIndex) {
        parts.push(segment.slice(segmentLastIndex, bareMatch.index))
      }

      const rawUrl = bareMatch[1]
      const trailingPunctuation = rawUrl.match(/[.,!?;:]+$/)?.[0] ?? ''
      const linkText = trailingPunctuation ? rawUrl.slice(0, -trailingPunctuation.length) : rawUrl

      parts.push(
        <a
          key={`${segmentKey}-url-${bareMatch.index}`}
          href={normalizeLinkHref(linkText)}
          target="_blank"
          rel="noreferrer"
          className="break-all text-primary underline underline-offset-2 hover:text-primary/80"
        >
          {linkText}
        </a>
      )
      if (trailingPunctuation) parts.push(trailingPunctuation)
      segmentLastIndex = bareMatch.index + rawUrl.length
    }

    if (segmentLastIndex < segment.length) {
      parts.push(segment.slice(segmentLastIndex))
    }

    return parts
  }

  while ((match = markdownLinkRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(...renderBareLinks(text.slice(lastIndex, match.index), `${keyPrefix}-text-${lastIndex}`))
    }

    nodes.push(
      <a
        key={`${keyPrefix}-link-${match.index}`}
        href={normalizeLinkHref(match[2])}
        target="_blank"
        rel="noreferrer"
        className="break-all text-primary underline underline-offset-2 hover:text-primary/80"
      >
        {match[1]}
      </a>
    )
    lastIndex = markdownLinkRegex.lastIndex
  }

  if (lastIndex < text.length) {
    nodes.push(...renderBareLinks(text.slice(lastIndex), `${keyPrefix}-text-${lastIndex}`))
  }

  return nodes
}

function RichTextContent({ content }: { content: string }) {
  const imageRegex = /!\[([^\]]*)\]\(((?:https?:\/\/|www\.)[^)\s]+)\)/g
  const nodes: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = imageRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        <span key={`text-${lastIndex}`} className="whitespace-pre-wrap">
          {renderLinkedText(content.slice(lastIndex, match.index), `text-${lastIndex}`)}
        </span>
      )
    }
    nodes.push(
      <a
        key={`image-link-${match.index}`}
        href={normalizeLinkHref(match[2])}
        target="_blank"
        rel="noreferrer"
        className="block"
      >
        <img
          src={normalizeLinkHref(match[2])}
          alt={match[1] || 'Task image'}
          loading="lazy"
          className="my-2 max-h-72 max-w-full rounded-lg border border-border/50 object-contain"
        />
      </a>
    )
    lastIndex = imageRegex.lastIndex
  }

  if (lastIndex < content.length) {
    nodes.push(
      <span key={`text-${lastIndex}`} className="whitespace-pre-wrap">
        {renderLinkedText(content.slice(lastIndex), `text-${lastIndex}`)}
      </span>
    )
  }

  return <div className="text-sm text-muted-foreground/80">{nodes}</div>
}

/* ─── Dropdown Helper ─────────────────────────────────────────────────── */

function Dropdown({ trigger, children, className }: {
  trigger: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(!open)} className="w-full">
        {trigger}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className={cn(
              'absolute z-50 mt-1 min-w-[180px] rounded-lg border border-border/60 bg-card shadow-xl',
              className
            )}
            onClick={() => setOpen(false)}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ─── Main Component ──────────────────────────────────────────────────── */

export function TaskDetailPanel({
  task, projectId, members, sections, labels,
  open, onClose, onTaskUpdate, onTaskDelete, onTasksChange, onOpenTask,
}: TaskDetailPanelProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [comments, setComments] = useState<Comment[]>([])
  const [activities, setActivities] = useState<TaskActivity[]>([])
  const [newComment, setNewComment] = useState('')
  const [newChildTitle, setNewChildTitle] = useState('')
  const [loadingComments, setLoadingComments] = useState(false)
  const [loadingActivities, setLoadingActivities] = useState(false)
  const [saving, setSaving] = useState(false)
  const [creatingChild, setCreatingChild] = useState(false)
  const [uploadingImage, setUploadingImage] = useState<'description' | 'comment' | null>(null)
  const [dueDateOpen, setDueDateOpen] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const descriptionImageInputRef = useRef<HTMLInputElement>(null)
  const commentImageInputRef = useRef<HTMLInputElement>(null)

  // Reset state when task changes
  useEffect(() => {
    if (task) {
      setTitle(task.title)
      setDescription(task.description || '')
      setNewChildTitle('')
      setDueDateOpen(false)
      loadComments(task.id)
      loadActivities(task.id)
    }
  }, [task?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadComments = async (taskId: string) => {
    setLoadingComments(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/comments?taskId=${taskId}`)
      const data = await res.json()
      setComments(data.comments || [])
    } catch { /* ignore */ }
    setLoadingComments(false)
  }

  const loadActivities = async (taskId: string) => {
    setLoadingActivities(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/task-activities?taskId=${taskId}`)
      const data = await res.json()
      setActivities(data.activities || [])
    } catch { /* ignore */ }
    setLoadingActivities(false)
  }

  const updateTask = useCallback(async (updates: Record<string, any>) => {
    if (!task) return
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id, ...updates }),
      })
      const data = await res.json()
      if (data.success) {
        onTaskUpdate(data.task)
        void loadActivities(task.id)
      }
    } catch {
      toast.error('Failed to update task')
    }
    setSaving(false)
  }, [task, projectId, onTaskUpdate])

  const handleTitleBlur = () => {
    if (title.trim() && title !== task?.title) {
      updateTask({ title: title.trim() })
    }
  }

  const handleDescBlur = () => {
    if (description !== (task?.description || '')) {
      updateTask({ description })
    }
  }

  const handleDelete = async () => {
    if (!task) return
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks?taskId=${task.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        onTaskDelete(task.id)
        onClose()
        toast.success('Task deleted')
      }
    } catch {
      toast.error('Failed to delete task')
    }
  }

  const postComment = async () => {
    if (!newComment.trim() || !task) return
    try {
      const res = await fetch(`/api/projects/${projectId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id, content: newComment.trim() }),
      })
      const data = await res.json()
      if (data.success) {
        setComments((prev) => [...prev, data.comment])
        setNewComment('')
        void loadActivities(task.id)
      }
    } catch {
      toast.error('Failed to post comment')
    }
  }

  const uploadImage = async (file: File | undefined, target: 'description' | 'comment') => {
    if (!file || !task) return
    try {
      setUploadingImage(target)
      const formData = new FormData()
      formData.set('projectId', projectId)
      formData.set('file', file)
      const res = await fetch('/api/projects/images', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok || !data.url) {
        throw new Error(data.error || 'Failed to upload image')
      }

      if (target === 'description') {
        const nextDescription = appendMarkdownImage(description, data.url)
        setDescription(nextDescription)
        await updateTask({ description: nextDescription })
      } else {
        setNewComment((prev) => appendMarkdownImage(prev, data.url))
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to upload image')
    } finally {
      setUploadingImage(null)
      if (descriptionImageInputRef.current) descriptionImageInputRef.current.value = ''
      if (commentImageInputRef.current) commentImageInputRef.current.value = ''
    }
  }

  const toggleLabel = async (labelId: string) => {
    if (!task) return
    const current = task.labelAssignments.map((la) => la.label.id)
    const next = current.includes(labelId)
      ? current.filter((id) => id !== labelId)
      : [...current, labelId]
    updateTask({ labelIds: next })
  }

  const toggleAssistant = async (memberId: string) => {
    if (!task || memberId === task.assigneeId) return
    const current = (task.assistants || []).map((assistant) => assistant.user.id)
    const next = current.includes(memberId)
      ? current.filter((id) => id !== memberId)
      : [...current, memberId]
    updateTask({ assistantIds: next })
  }

  const clearAssistants = async () => {
    if (!task || !task.assistants?.length) return
    updateTask({ assistantIds: [] })
  }

  const createChildTask = async () => {
    if (!task || !newChildTitle.trim()) return
    setCreatingChild(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newChildTitle.trim(),
          parentTaskId: task.id,
          sectionId: task.sectionId,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create child task')
      }
      setNewChildTitle('')
      toast.success('Child task created')
      await onTasksChange?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create child task')
    } finally {
      setCreatingChild(false)
    }
  }

  if (!task) return null

  const assignedLabels = task.labelAssignments.map((la) => la.label.id)
  const assistants = task.assistants || []
  const assistantIds = assistants.map((assistant) => assistant.user.id)
  const childTasks = task.childTasks || []
  const availableAssistantMembers = members.filter((member) => member.id !== task.assigneeId)

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg p-0 flex flex-col overflow-hidden [&>button:first-child]:hidden"
      >
        <SheetHeader className="sr-only">
          <SheetTitle>Task Details</SheetTitle>
        </SheetHeader>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border/50">
          <div className="flex items-center gap-2">
            {saving && (
              <span className="text-[10px] text-muted-foreground animate-pulse">Saving...</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleDelete}
              className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors"
              title="Delete task"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {/* Title */}
          <div className="px-5 pt-4 pb-2">
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
              className="w-full text-lg font-semibold bg-transparent border-none outline-none placeholder:text-muted-foreground/50"
              placeholder="Task name"
            />
          </div>

          {/* Fields */}
          <div className="px-5 py-3 space-y-3">
            {/* Status */}
            <FieldRow icon={<Check className="w-4 h-4" />} label="Status">
              <Dropdown
                trigger={
                  <span
                    className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium"
                    style={{
                      backgroundColor: `${statusColorForSection(task.section, task.status)}22`,
                      color: statusColorForSection(task.section, task.status),
                    }}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: statusColorForSection(task.section, task.status) }}
                    />
                    {statusLabelForTask(task)}
                    <ChevronDown className="w-3 h-3 opacity-60" />
                  </span>
                }
              >
                <div className="max-h-56 overflow-y-auto p-1">
                  {sections.map((section) => (
                    <button
                      key={section.id}
                      onClick={() => updateTask({ sectionId: section.id })}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted/50 transition-colors',
                        task.sectionId === section.id && 'bg-muted/50'
                      )}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: section.color }} />
                      <span className="flex-1 text-left">{section.name}</span>
                      {section.isDone && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                    </button>
                  ))}
                </div>
              </Dropdown>
            </FieldRow>

            {/* Assignee */}
            <FieldRow icon={<Users className="w-4 h-4" />} label="Assignee">
              <Dropdown
                trigger={
                  <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md text-sm hover:bg-muted/30 transition-colors">
                    {task.assignee ? (
                      <>
                        <UserAvatar name={task.assignee.name} size="xs" />
                        {task.assignee.name}
                      </>
                    ) : (
                      <span className="text-muted-foreground">Unassigned</span>
                    )}
                    <ChevronDown className="w-3 h-3 opacity-60" />
                  </span>
                }
              >
                <div className="p-1 max-h-48 overflow-y-auto">
                  <button
                    onClick={() => updateTask({ assigneeId: null })}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted/50 transition-colors text-muted-foreground"
                  >
                    Unassigned
                  </button>
                  {members.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => updateTask({ assigneeId: m.id })}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted/50 transition-colors',
                        task.assigneeId === m.id && 'bg-muted/50'
                      )}
                    >
                      <UserAvatar name={m.name} size="xs" />
                      {m.name}
                    </button>
                  ))}
                </div>
              </Dropdown>
            </FieldRow>

            {/* Assistants */}
            <FieldRow icon={<UserRoundCheck className="w-4 h-4" />} label="Assistants">
              <Dropdown
                trigger={
                  <span className="inline-flex max-w-full items-center gap-2 rounded-md px-2.5 py-1 text-sm hover:bg-muted/30 transition-colors">
                    {assistants.length > 0 ? (
                      <>
                        <span className="flex -space-x-1.5">
                          {assistants.slice(0, 3).map((assistant) => (
                            <UserAvatar
                              key={assistant.user.id}
                              name={assistant.user.name}
                              size="xs"
                              className="ring-2 ring-background"
                            />
                          ))}
                        </span>
                        <span className="truncate">
                          {assistants.slice(0, 2).map((assistant) => assistant.user.name).join(', ')}
                          {assistants.length > 2 ? ` +${assistants.length - 2}` : ''}
                        </span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">No assistants</span>
                    )}
                    <ChevronDown className="w-3 h-3 opacity-60 shrink-0" />
                  </span>
                }
                className="min-w-[220px]"
              >
                <div className="p-1 max-h-56 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                  {assistants.length > 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); clearAssistants() }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted/50 transition-colors text-muted-foreground"
                    >
                      Clear assistants
                    </button>
                  )}
                  {availableAssistantMembers.map((m) => (
                    <button
                      key={m.id}
                      onClick={(e) => { e.stopPropagation(); toggleAssistant(m.id) }}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted/50 transition-colors',
                        assistantIds.includes(m.id) && 'bg-muted/50'
                      )}
                    >
                      <UserAvatar name={m.name} size="xs" />
                      <span className="flex-1 text-left">{m.name}</span>
                      {assistantIds.includes(m.id) && <Check className="w-3.5 h-3.5 text-primary" />}
                    </button>
                  ))}
                  {availableAssistantMembers.length === 0 && (
                    <p className="px-3 py-2 text-sm text-muted-foreground">No other project members available.</p>
                  )}
                </div>
              </Dropdown>
            </FieldRow>

            {/* Due Date */}
            <FieldRow icon={<CalendarIcon className="w-4 h-4" />} label="Due date">
              <Popover open={dueDateOpen} onOpenChange={setDueDateOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'inline-flex items-center gap-2 rounded-md px-2.5 py-1 text-sm transition-colors hover:bg-muted/30',
                      !task.dueDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="w-3.5 h-3.5" />
                    {formatTaskDate(task.dueDate)}
                    <ChevronDown className="w-3 h-3 opacity-60" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="z-[80] w-auto p-0">
                  <DatePicker
                    mode="single"
                    selected={parseTaskDate(task.dueDate)}
                    onSelect={(date) => {
                      if (!date) return
                      void updateTask({ dueDate: toLocalDateValue(date) })
                      setDueDateOpen(false)
                    }}
                    autoFocus
                  />
                  {task.dueDate ? (
                    <div className="border-t border-border/60 p-2">
                      <button
                        type="button"
                        onClick={() => {
                          void updateTask({ dueDate: null })
                          setDueDateOpen(false)
                        }}
                        className="w-full rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                      >
                        Clear deadline
                      </button>
                    </div>
                  ) : null}
                </PopoverContent>
              </Popover>
            </FieldRow>

            {/* Priority */}
            <FieldRow icon={<Flag className="w-4 h-4" />} label="Priority">
              <Dropdown
                trigger={
                  <span className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm',
                    PRIORITY_CONFIG[task.priority].color
                  )}>
                    <Flag className="w-3.5 h-3.5" />
                    {PRIORITY_CONFIG[task.priority].label}
                    <ChevronDown className="w-3 h-3 opacity-60" />
                  </span>
                }
              >
                <div className="p-1">
                  {Object.entries(PRIORITY_CONFIG).map(([key, cfg]) => (
                    <button
                      key={key}
                      onClick={() => updateTask({ priority: key })}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted/50 transition-colors',
                        task.priority === key && 'bg-muted/50'
                      )}
                    >
                      <Flag className={cn('w-3.5 h-3.5', cfg.color)} />
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </Dropdown>
            </FieldRow>

            {/* Labels */}
            {labels.length > 0 && (
              <FieldRow icon={<Tag className="w-4 h-4" />} label="Labels">
                <Dropdown
                  trigger={
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm hover:bg-muted/30 transition-colors flex-wrap">
                      {task.labelAssignments.length > 0 ? (
                        task.labelAssignments.map((la) => (
                          <span
                            key={la.label.id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{ backgroundColor: la.label.color + '20', color: la.label.color }}
                          >
                            {la.label.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-muted-foreground">No labels</span>
                      )}
                      <ChevronDown className="w-3 h-3 opacity-60 ml-1" />
                    </span>
                  }
                  className="min-w-[200px]"
                >
                  <div className="p-1 max-h-48 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                    {labels.map((l) => (
                      <button
                        key={l.id}
                        onClick={(e) => { e.stopPropagation(); toggleLabel(l.id) }}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted/50 transition-colors',
                          assignedLabels.includes(l.id) && 'bg-muted/50'
                        )}
                      >
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: l.color }} />
                        {l.name}
                        {assignedLabels.includes(l.id) && <Check className="w-3.5 h-3.5 ml-auto text-primary" />}
                      </button>
                    ))}
                  </div>
                </Dropdown>
              </FieldRow>
            )}
          </div>

          {/* Divider */}
          <div className="mx-5 border-t border-border/40" />

          {/* Parent and child tasks */}
          <div className="px-5 py-4 space-y-4">
            {task.parentTask && (
              <div>
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                  <GitBranch className="w-3.5 h-3.5" />
                  Parent task
                </h4>
                <button
                  type="button"
                  onClick={() => onOpenTask?.(task.parentTask!.id)}
                  className="w-full rounded-lg border border-border/40 bg-muted/10 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/30"
                >
                  <span className="font-medium">{task.parentTask.title}</span>
                  {task.parentTask.assignee && (
                    <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <UserAvatar name={task.parentTask.assignee.name} size="xs" />
                      {task.parentTask.assignee.name}
                    </span>
                  )}
                </button>
              </div>
            )}

            <div>
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                <GitBranch className="w-3.5 h-3.5" />
                Child tasks ({childTasks.length})
              </h4>

              <div className="space-y-2">
                {childTasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground/60 py-1">No child tasks yet.</p>
                ) : (
                  childTasks.map((child) => {
                    const status = STATUS_CONFIG[child.status] || STATUS_CONFIG.IN_PROGRESS
                    const childStatusColor = statusColorForSection(child.section, child.status)
                    return (
                      <button
                        key={child.id}
                        type="button"
                        onClick={() => onOpenTask?.(child.id)}
                        className="w-full rounded-lg border border-border/40 bg-muted/10 px-3 py-2 text-left transition-colors hover:bg-muted/30"
                      >
                        <div className="flex items-start gap-2">
                          <span className="mt-1.5 h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: childStatusColor }} />
                          <div className="min-w-0 flex-1">
                            <p className={cn(
                              'text-sm font-medium truncate',
                              child.status === 'DONE' && 'line-through text-muted-foreground'
                            )}>
                              {child.title}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                              <span>{child.section?.name || status.label}</span>
                              {child.assignee && (
                                <span className="inline-flex items-center gap-1">
                                  <UserAvatar name={child.assignee.name} size="xs" />
                                  {child.assignee.name}
                                </span>
                              )}
                              {child.dueDate && (
                                <span>{formatTaskDate(child.dueDate)}</span>
                              )}
                              {child._count.comments > 0 && (
                                <span className="inline-flex items-center gap-1">
                                  <MessageSquare className="w-3 h-3" />
                                  {child._count.comments}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>

              <div className="mt-3 flex items-center gap-2">
                <input
                  value={newChildTitle}
                  onChange={(e) => setNewChildTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') createChildTask()
                    if (e.key === 'Escape') setNewChildTitle('')
                  }}
                  placeholder="Add child task"
                  className="min-w-0 flex-1 rounded-lg border border-border/30 bg-muted/20 px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary/30"
                />
                <button
                  type="button"
                  onClick={createChildTask}
                  disabled={!newChildTitle.trim() || creatingChild}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-30"
                  title="Create child task"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="mx-5 border-t border-border/40" />

          {/* Description */}
          <div className="px-5 py-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Description</h4>
              <button
                type="button"
                onClick={() => descriptionImageInputRef.current?.click()}
                disabled={uploadingImage === 'description'}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {uploadingImage === 'description' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
                Image
              </button>
              <input
                ref={descriptionImageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => void uploadImage(event.target.files?.[0], 'description')}
              />
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={handleDescBlur}
              placeholder="Add a more detailed description..."
              className="w-full min-h-[80px] bg-muted/20 rounded-lg p-3 text-sm border border-border/30 outline-none resize-y placeholder:text-muted-foreground/40 focus:border-primary/30 transition-colors"
              rows={3}
            />
            {description.trim() && (
              <div className="mt-3 rounded-lg border border-border/30 bg-muted/10 p-3">
                <RichTextContent content={description} />
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="mx-5 border-t border-border/40" />

          {/* Comments */}
          <div className="px-5 py-4">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              <MessageSquare className="w-3.5 h-3.5" />
              Comments ({comments.length})
            </h4>

            <div className="space-y-3 mb-4">
              {loadingComments ? (
                <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                  <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  Loading...
                </div>
              ) : comments.length === 0 ? (
                <p className="text-sm text-muted-foreground/60 py-2">No comments yet. Be the first to comment.</p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="flex gap-2.5">
                    <UserAvatar name={c.author.name} size="xs" className="mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{c.author.name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(c.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="mt-0.5">
                        <RichTextContent content={c.content} />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* New comment */}
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); postComment() }
                  }}
                  placeholder="Write a comment..."
                  className="w-full bg-muted/20 rounded-lg p-2.5 text-sm border border-border/30 outline-none resize-none placeholder:text-muted-foreground/40 focus:border-primary/30 transition-colors"
                  rows={2}
                />
                {newComment.trim() && (
                  <div className="mt-2 rounded-lg border border-border/30 bg-muted/10 p-2.5">
                    <RichTextContent content={newComment} />
                  </div>
                )}
              </div>
              <input
                ref={commentImageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => void uploadImage(event.target.files?.[0], 'comment')}
              />
              <button
                onClick={() => commentImageInputRef.current?.click()}
                disabled={uploadingImage === 'comment'}
                className="p-2.5 rounded-lg bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                title="Add image"
              >
                {uploadingImage === 'comment' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
              </button>
              <button
                onClick={postComment}
                disabled={!newComment.trim()}
                className="p-2.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Divider */}
          <div className="mx-5 border-t border-border/40" />

          {/* Activity */}
          <div className="px-5 py-4">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              <History className="w-3.5 h-3.5" />
              Activity
            </h4>
            {loadingActivities ? (
              <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
                <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                Loading...
              </div>
            ) : activities.length === 0 ? (
              <p className="text-sm text-muted-foreground/60 py-1">No activity yet.</p>
            ) : (
              <div className="space-y-2">
                {activities.map((activity) => (
                  <div key={activity.id} className="rounded-lg border border-border/30 bg-muted/10 px-3 py-2">
                    <p className="text-sm text-foreground/90">{activity.summary}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {new Date(activity.createdAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/* ─── Field Row ───────────────────────────────────────────────────────── */

function FieldRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 w-24 shrink-0 text-muted-foreground">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  )
}
