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
  History, Loader2, Bold, Underline, List
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
  isBacklog?: boolean
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
  assistants?: TaskAssistant[]
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
  assistants?: TaskAssistant[]
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
  completedLate?: boolean
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
  canManage?: boolean
  canEdit?: boolean
  canComment?: boolean
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
  if (value.startsWith('/')) return value
  return value.startsWith('http://') || value.startsWith('https://') ? value : `https://${value}`
}

function renderInlineText(text: string, keyPrefix: string, depth = 0): React.ReactNode[] {
  const inlineRegex = /\[([^\]]+)\]\(((?:https?:\/\/|www\.)[^)\s]+)\)|\*\*([^*]+)\*\*|<u>(.*?)<\/u>|\b((?:https?:\/\/|www\.)[^\s<>()]+)/gi
  const nodes: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = inlineRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }

    if (match[1] && match[2]) {
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
    } else if (match[3]) {
      nodes.push(
        <strong key={`${keyPrefix}-bold-${match.index}`} className="font-semibold text-foreground/90">
          {depth < 2 ? renderInlineText(match[3], `${keyPrefix}-bold-${match.index}`, depth + 1) : match[3]}
        </strong>
      )
    } else if (match[4]) {
      nodes.push(
        <span key={`${keyPrefix}-underline-${match.index}`} className="underline underline-offset-2">
          {depth < 2 ? renderInlineText(match[4], `${keyPrefix}-underline-${match.index}`, depth + 1) : match[4]}
        </span>
      )
    } else if (match[5]) {
      const rawUrl = match[5]
      const trailingPunctuation = rawUrl.match(/[.,!?;:]+$/)?.[0] ?? ''
      const linkText = trailingPunctuation ? rawUrl.slice(0, -trailingPunctuation.length) : rawUrl

      nodes.push(
        <a
          key={`${keyPrefix}-url-${match.index}`}
          href={normalizeLinkHref(linkText)}
          target="_blank"
          rel="noreferrer"
          className="break-all text-primary underline underline-offset-2 hover:text-primary/80"
        >
          {linkText}
        </a>
      )
      if (trailingPunctuation) nodes.push(trailingPunctuation)
    }

    lastIndex = inlineRegex.lastIndex
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes
}

function renderTextBlocks(text: string, keyPrefix: string) {
  const lines = text.split('\n')
  const blocks: React.ReactNode[] = []
  let paragraph: string[] = []
  let bullets: string[] = []

  const flushParagraph = () => {
    if (paragraph.length === 0) return
    const content = paragraph.join('\n')
    blocks.push(
      <p key={`${keyPrefix}-p-${blocks.length}`} className="whitespace-pre-wrap">
        {renderInlineText(content, `${keyPrefix}-p-${blocks.length}`)}
      </p>
    )
    paragraph = []
  }

  const flushBullets = () => {
    if (bullets.length === 0) return
    blocks.push(
      <ul key={`${keyPrefix}-ul-${blocks.length}`} className="list-disc space-y-1 pl-5">
        {bullets.map((item, index) => (
          <li key={`${keyPrefix}-li-${blocks.length}-${index}`}>
            {renderInlineText(item, `${keyPrefix}-li-${blocks.length}-${index}`)}
          </li>
        ))}
      </ul>
    )
    bullets = []
  }

  for (const line of lines) {
    const bulletMatch = line.match(/^\s*[-*]\s+(.+)$/)
    if (bulletMatch) {
      flushParagraph()
      bullets.push(bulletMatch[1])
      continue
    }

    flushBullets()
    if (line.trim() === '') {
      flushParagraph()
      blocks.push(<div key={`${keyPrefix}-space-${blocks.length}`} className="h-2" />)
    } else {
      paragraph.push(line)
    }
  }

  flushParagraph()
  flushBullets()

  return blocks
}

function RichTextContent({ content }: { content: string }) {
  const imageRegex = /!\[([^\]]*)\]\(((?:https?:\/\/|www\.|\/)[^)\s]+)\)/g
  const nodes: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = imageRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(
        <div key={`text-${lastIndex}`} className="space-y-2">
          {renderTextBlocks(content.slice(lastIndex, match.index), `text-${lastIndex}`)}
        </div>
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
      <div key={`text-${lastIndex}`} className="space-y-2">
        {renderTextBlocks(content.slice(lastIndex), `text-${lastIndex}`)}
      </div>
    )
  }

  return <div className="space-y-2 text-sm text-muted-foreground/80">{nodes}</div>
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
  canManage = true, canEdit = true, canComment = true,
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
  const descriptionTextareaRef = useRef<HTMLTextAreaElement>(null)
  const commentTextareaRef = useRef<HTMLTextAreaElement>(null)
  const descriptionImageInputRef = useRef<HTMLInputElement>(null)
  const commentImageInputRef = useRef<HTMLInputElement>(null)
  const activeTaskKeyRef = useRef<string | null>(null)
  const commentsRequestRef = useRef(0)
  const activitiesRequestRef = useRef(0)

  // Reset state when task changes
  useEffect(() => {
    activeTaskKeyRef.current = task ? `${projectId}:${task.id}` : null
    setComments([])
    setActivities([])
    setLoadingComments(false)
    setLoadingActivities(false)
    if (task) {
      setTitle(task.title)
      setDescription(task.description || '')
      setNewChildTitle('')
      setDueDateOpen(false)
      void loadComments(task.id)
      void loadActivities(task.id)
    }
  }, [projectId, task?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Same-task updates can arrive from the workspace table, Kanban, or a
  // refetch. Rehydrate fields unless the user is actively editing that field.
  useEffect(() => {
    if (!task) return
    if (document.activeElement !== titleRef.current) setTitle(task.title)
    if (document.activeElement !== descriptionTextareaRef.current) setDescription(task.description || '')
  }, [task?.title, task?.description])

  const loadComments = async (taskId: string) => {
    const requestId = ++commentsRequestRef.current
    const taskKey = `${projectId}:${taskId}`
    setLoadingComments(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/comments?taskId=${taskId}`)
      const data = await res.json()
      if (requestId === commentsRequestRef.current && activeTaskKeyRef.current === taskKey) {
        setComments(data.comments || [])
      }
    } catch { /* ignore */ }
    if (requestId === commentsRequestRef.current && activeTaskKeyRef.current === taskKey) {
      setLoadingComments(false)
    }
  }

  const loadActivities = async (taskId: string) => {
    const requestId = ++activitiesRequestRef.current
    const taskKey = `${projectId}:${taskId}`
    setLoadingActivities(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/task-activities?taskId=${taskId}`)
      const data = await res.json()
      if (requestId === activitiesRequestRef.current && activeTaskKeyRef.current === taskKey) {
        setActivities(data.activities || [])
      }
    } catch { /* ignore */ }
    if (requestId === activitiesRequestRef.current && activeTaskKeyRef.current === taskKey) {
      setLoadingActivities(false)
    }
  }

  const updateTask = useCallback(async (updates: Record<string, any>) => {
    if (!task || !canEdit) return
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id, ...updates }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update task')
      }
      onTaskUpdate(data.task)
      await onTasksChange?.()
      void loadActivities(task.id)
      return data.task as PanelTask
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update task')
      return undefined
    } finally {
      setSaving(false)
    }
  }, [task, projectId, onTaskUpdate, onTasksChange, canEdit])

  const handleStatusChange = (section: ProjectStatusSection) => {
    if (
      task?.section?.isBacklog &&
      !section.isBacklog &&
      (!task.assigneeId || !task.dueDate)
    ) {
      toast.error('Add an assignee and due date before moving this task out of Backlog')
      return
    }
    void updateTask({ sectionId: section.id })
  }

  const handleTitleBlur = async () => {
    if (!task) return
    const nextTitle = title.trim()
    if (!nextTitle) {
      setTitle(task.title)
      return
    }
    if (nextTitle !== task.title) {
      const saved = await updateTask({ title: nextTitle })
      if (!saved) setTitle(task.title)
    }
  }

  const handleDescBlur = async () => {
    if (!task) return
    if (description !== (task.description || '')) {
      const saved = await updateTask({ description })
      if (!saved) setDescription(task.description || '')
    }
  }

  const handleDelete = async () => {
    if (!task || !canManage) return
    const hasChildren = Boolean(task.childTasks?.length)
    const warning = hasChildren
      ? 'Delete this task and all of its subtasks? This cannot be undone.'
      : 'Delete this task? This cannot be undone.'
    if (!window.confirm(warning)) return
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks?taskId=${task.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to delete task')
      onTaskDelete(task.id)
      onClose()
      toast.success('Task deleted')
      await onTasksChange?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete task')
    }
  }

  const postComment = async () => {
    if (!newComment.trim() || !task || !canComment) return
    try {
      const res = await fetch(`/api/projects/${projectId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: task.id, content: newComment.trim() }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to post comment')
      setComments((prev) => [...prev, data.comment])
      setNewComment('')
      void loadActivities(task.id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to post comment')
    }
  }

  const uploadImage = async (file: File | undefined, target: 'description' | 'comment') => {
    if (!file || !task || (target === 'description' ? !canEdit : !canComment)) return
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

  const applyTextFormat = (target: 'description' | 'comment', format: 'bold' | 'underline' | 'bullet') => {
    const textarea = target === 'description' ? descriptionTextareaRef.current : commentTextareaRef.current
    const value = target === 'description' ? description : newComment
    const setValue = target === 'description' ? setDescription : setNewComment
    const start = textarea?.selectionStart ?? value.length
    const end = textarea?.selectionEnd ?? value.length
    const selected = value.slice(start, end)
    let nextText = ''
    let cursorStart = start
    let cursorEnd = end

    if (format === 'bold') {
      const fallback = selected || 'bold text'
      nextText = `**${fallback}**`
      cursorStart = start + 2
      cursorEnd = start + 2 + fallback.length
    } else if (format === 'underline') {
      const fallback = selected || 'underlined text'
      nextText = `<u>${fallback}</u>`
      cursorStart = start + 3
      cursorEnd = start + 3 + fallback.length
    } else {
      const lineStart = value.lastIndexOf('\n', Math.max(start - 1, 0)) + 1
      const lineEndIndex = value.indexOf('\n', end)
      const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex
      const block = value.slice(lineStart, lineEnd)
      const formatted = block.trim()
        ? block.split('\n').map((line) => line.trim() ? (line.match(/^\s*[-*]\s+/) ? line : `- ${line}`) : line).join('\n')
        : '- '
      const nextValue = `${value.slice(0, lineStart)}${formatted}${value.slice(lineEnd)}`
      setValue(nextValue)
      window.requestAnimationFrame(() => {
        textarea?.focus()
        const nextPosition = lineStart + formatted.length
        textarea?.setSelectionRange(nextPosition, nextPosition)
      })
      return
    }

    const nextValue = `${value.slice(0, start)}${nextText}${value.slice(end)}`
    setValue(nextValue)
    window.requestAnimationFrame(() => {
      textarea?.focus()
      textarea?.setSelectionRange(cursorStart, cursorEnd)
    })
  }

  const toggleLabel = async (labelId: string) => {
    if (!task || !canEdit) return
    const current = task.labelAssignments.map((la) => la.label.id)
    const next = current.includes(labelId)
      ? current.filter((id) => id !== labelId)
      : [...current, labelId]
    updateTask({ labelIds: next })
  }

  const toggleAssistant = async (memberId: string) => {
    if (!task || !canEdit || !canManage || memberId === task.assigneeId) return
    const current = (task.assistants || []).map((assistant) => assistant.user.id)
    const next = current.includes(memberId)
      ? current.filter((id) => id !== memberId)
      : [...current, memberId]
    updateTask({ assistantIds: next })
  }

  const clearAssistants = async () => {
    if (!task || !canEdit || !canManage || !task.assistants?.length) return
    updateTask({ assistantIds: [] })
  }

  const createChildTask = async () => {
    if (!task || !canEdit || !newChildTitle.trim()) return
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
      toast.success('Subtask created')
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
  const renderFormatToolbar = (target: 'description' | 'comment') => (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => applyTextFormat(target, 'bold')}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        title="Bold"
      >
        <Bold className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => applyTextFormat(target, 'underline')}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        title="Underline"
      >
        <Underline className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => applyTextFormat(target, 'bullet')}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        title="Bulleted list"
      >
        <List className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => (target === 'description' ? descriptionImageInputRef.current : commentImageInputRef.current)?.click()}
        disabled={uploadingImage === target}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        title="Image"
      >
        {uploadingImage === target ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
      </button>
    </div>
  )

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
            {!canEdit && (
              <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">Task fields read only</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {canManage && (
              <button
                onClick={handleDelete}
                className="p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors"
                title="Delete task"
                aria-label="Delete task"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              aria-label="Close task details"
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
              onBlur={() => canEdit && handleTitleBlur()}
              onKeyDown={(e) => { if (canEdit && e.key === 'Enter') e.currentTarget.blur() }}
              readOnly={!canEdit}
              className={cn(
                'w-full text-lg font-semibold bg-transparent border-none outline-none placeholder:text-muted-foreground/50',
                !canEdit && 'cursor-default',
              )}
              placeholder="Task name"
            />
          </div>

          {/* Fields */}
          <div className="px-5 py-3 space-y-3">
            {/* Status */}
            <FieldRow icon={<Check className="w-4 h-4" />} label="Status">
              {canEdit ? (
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
                      onClick={() => handleStatusChange(section)}
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
              ) : (
                <span
                  className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium"
                  style={{
                    backgroundColor: `${statusColorForSection(task.section, task.status)}22`,
                    color: statusColorForSection(task.section, task.status),
                  }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: statusColorForSection(task.section, task.status) }} />
                  {statusLabelForTask(task)}
                </span>
              )}
            </FieldRow>

            {/* Assignee */}
            <FieldRow icon={<Users className="w-4 h-4" />} label="Assignee">
              {canManage && canEdit ? (
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
              ) : (
                <span className="inline-flex items-center gap-2 px-2.5 py-1 text-sm">
                  {task.assignee ? (
                    <>
                      <UserAvatar name={task.assignee.name} size="xs" />
                      {task.assignee.name}
                    </>
                  ) : (
                    <span className="text-muted-foreground">Unassigned</span>
                  )}
                </span>
              )}
            </FieldRow>

            {/* Co-assignees */}
            <FieldRow icon={<UserRoundCheck className="w-4 h-4" />} label="Co-assignees">
              {canManage && canEdit ? (
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
                      <span className="text-muted-foreground">No co-assignees</span>
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
                      Clear co-assignees
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
              ) : (
                <span className="inline-flex max-w-full items-center gap-2 px-2.5 py-1 text-sm">
                  {assistants.length > 0 ? (
                    <>
                      <span className="flex -space-x-1.5">
                        {assistants.slice(0, 3).map((assistant) => (
                          <UserAvatar key={assistant.user.id} name={assistant.user.name} size="xs" className="ring-2 ring-background" />
                        ))}
                      </span>
                      <span className="truncate">{assistants.map((assistant) => assistant.user.name).join(', ')}</span>
                    </>
                  ) : <span className="text-muted-foreground">No co-assignees</span>}
                </span>
              )}
            </FieldRow>

            {/* Due Date */}
            <FieldRow icon={<CalendarIcon className="w-4 h-4" />} label="Due date">
              {canEdit ? (
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
              ) : (
                <span className={cn('inline-flex items-center gap-2 px-2.5 py-1 text-sm', !task.dueDate && 'text-muted-foreground')}>
                  <CalendarIcon className="w-3.5 h-3.5" />
                  {formatTaskDate(task.dueDate)}
                </span>
              )}
            </FieldRow>

            {/* Priority */}
            <FieldRow icon={<Flag className="w-4 h-4" />} label="Priority">
              {canEdit ? (
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
                  {Object.entries(PRIORITY_CONFIG).filter(([key]) => key !== 'URGENT').map(([key, cfg]) => (
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
              ) : (
                <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 text-sm', PRIORITY_CONFIG[task.priority].color)}>
                  <Flag className="w-3.5 h-3.5" />
                  {PRIORITY_CONFIG[task.priority].label}
                </span>
              )}
            </FieldRow>

            {/* Labels */}
            {labels.length > 0 && (
              <FieldRow icon={<Tag className="w-4 h-4" />} label="Labels">
                {canEdit ? (
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
                ) : (
                  <span className="inline-flex flex-wrap items-center gap-1.5 px-2.5 py-1 text-sm">
                    {task.labelAssignments.length > 0 ? task.labelAssignments.map((assignment) => (
                      <span
                        key={assignment.label.id}
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{ backgroundColor: `${assignment.label.color}20`, color: assignment.label.color }}
                      >
                        {assignment.label.name}
                      </span>
                    )) : <span className="text-muted-foreground">No labels</span>}
                  </span>
                )}
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
                  {Boolean(task.parentTask.assistants?.length) && (
                    <span className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="flex -space-x-1">
                        {task.parentTask.assistants!.slice(0, 3).map((assistant) => (
                          <UserAvatar
                            key={assistant.user.id}
                            name={assistant.user.name}
                            size="xs"
                            className="ring-1 ring-background"
                          />
                        ))}
                      </span>
                      +{task.parentTask.assistants!.length} co-assignee{task.parentTask.assistants!.length === 1 ? '' : 's'}
                    </span>
                  )}
                </button>
              </div>
            )}

            <div>
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                <GitBranch className="w-3.5 h-3.5" />
                Subtasks ({childTasks.length})
              </h4>

              <div className="space-y-2">
                {childTasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground/60 py-1">No subtasks yet.</p>
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
                              {Boolean(child.assistants?.length) && (
                                <span className="inline-flex items-center gap-1">
                                  <span className="flex -space-x-1">
                                    {child.assistants!.slice(0, 3).map((assistant) => (
                                      <UserAvatar
                                        key={assistant.user.id}
                                        name={assistant.user.name}
                                        size="xs"
                                        className="ring-1 ring-background"
                                      />
                                    ))}
                                  </span>
                                  +{child.assistants!.length} co-assignee{child.assistants!.length === 1 ? '' : 's'}
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

              {canEdit && <div className="mt-3 flex items-center gap-2">
                <input
                  value={newChildTitle}
                  onChange={(e) => setNewChildTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') createChildTask()
                    if (e.key === 'Escape') setNewChildTitle('')
                  }}
                  placeholder="Add subtask"
                  className="min-w-0 flex-1 rounded-lg border border-border/30 bg-muted/20 px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground/40 focus:border-primary/30"
                />
                <button
                  type="button"
                  onClick={createChildTask}
                  disabled={!newChildTitle.trim() || creatingChild}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-30"
                  title="Create subtask"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>}
            </div>
          </div>

          {/* Divider */}
          <div className="mx-5 border-t border-border/40" />

          {/* Description */}
          <div className="px-5 py-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Description</h4>
              {canEdit && (
                <>
                  {renderFormatToolbar('description')}
                  <input
                    ref={descriptionImageInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="hidden"
                    onChange={(event) => void uploadImage(event.target.files?.[0], 'description')}
                  />
                </>
              )}
            </div>
            <textarea
              ref={descriptionTextareaRef}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={() => canEdit && handleDescBlur()}
              readOnly={!canEdit}
              placeholder="Add a more detailed description..."
              className={cn(
                'w-full min-h-[80px] bg-muted/20 rounded-lg p-3 text-sm border border-border/30 outline-none resize-y placeholder:text-muted-foreground/40 focus:border-primary/30 transition-colors',
                !canEdit && 'cursor-default resize-none',
              )}
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
            {canComment && <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center justify-end">
                  {renderFormatToolbar('comment')}
                </div>
                <textarea
                  ref={commentTextareaRef}
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
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(event) => void uploadImage(event.target.files?.[0], 'comment')}
              />
              <button
                type="button"
                onClick={postComment}
                disabled={!newComment.trim()}
                className="p-2.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                aria-label="Send comment"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>}
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
