'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle
} from '@/components/ui/sheet'
import { UserAvatar } from '@/components/composed/UserAvatar'
import {
  X, Trash2, Calendar, Flag, Tag, Users, MessageSquare,
  Send, FolderOpen, ChevronDown, Check
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

interface Section {
  id: string
  name: string
}

interface Comment {
  id: string
  content: string
  createdAt: string
  author: TaskUser
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
  section: Section | null
  labelAssignments: LabelAssignment[]
  _count: { comments: number }
}

interface TaskDetailPanelProps {
  task: PanelTask | null
  projectId: string
  members: { id: string; name: string; role: string }[]
  sections: Section[]
  labels: Label[]
  open: boolean
  onClose: () => void
  onTaskUpdate: (task: any) => void
  onTaskDelete: (taskId: string) => void
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
  open, onClose, onTaskUpdate, onTaskDelete,
}: TaskDetailPanelProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [comments, setComments] = useState<Comment[]>([])
  const [newComment, setNewComment] = useState('')
  const [loadingComments, setLoadingComments] = useState(false)
  const [saving, setSaving] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const saveTimeout = useRef<NodeJS.Timeout | null>(null)

  // Reset state when task changes
  useEffect(() => {
    if (task) {
      setTitle(task.title)
      setDescription(task.description || '')
      loadComments(task.id)
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
      if (data.success) onTaskUpdate(data.task)
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
      }
    } catch {
      toast.error('Failed to post comment')
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

  if (!task) return null

  const assignedLabels = task.labelAssignments.map((la) => la.label.id)

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
                  <span className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm font-medium',
                    STATUS_CONFIG[task.status].bg, STATUS_CONFIG[task.status].color
                  )}>
                    {STATUS_CONFIG[task.status].label}
                    <ChevronDown className="w-3 h-3 opacity-60" />
                  </span>
                }
              >
                <div className="p-1">
                  {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                    <button
                      key={key}
                      onClick={() => updateTask({ status: key })}
                      className={cn(
                        'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted/50 transition-colors',
                        task.status === key && 'bg-muted/50'
                      )}
                    >
                      <span className={cn('w-2 h-2 rounded-full', cfg.color.replace('text-', 'bg-'))} />
                      {cfg.label}
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

            {/* Due Date */}
            <FieldRow icon={<Calendar className="w-4 h-4" />} label="Due date">
              <input
                type="date"
                value={task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : ''}
                onChange={(e) => updateTask({ dueDate: e.target.value || null })}
                className="bg-transparent border-none outline-none text-sm py-1 px-2 rounded-md hover:bg-muted/30 transition-colors"
              />
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

            {/* Section */}
            {sections.length > 0 && (
              <FieldRow icon={<FolderOpen className="w-4 h-4" />} label="Section">
                <Dropdown
                  trigger={
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-sm hover:bg-muted/30 transition-colors">
                      {task.section?.name || <span className="text-muted-foreground">None</span>}
                      <ChevronDown className="w-3 h-3 opacity-60" />
                    </span>
                  }
                >
                  <div className="p-1">
                    <button
                      onClick={() => updateTask({ sectionId: null })}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted/50 transition-colors text-muted-foreground"
                    >
                      None
                    </button>
                    {sections.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => updateTask({ sectionId: s.id })}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-muted/50 transition-colors',
                          task.sectionId === s.id && 'bg-muted/50'
                        )}
                      >
                        {s.name}
                      </button>
                    ))}
                  </div>
                </Dropdown>
              </FieldRow>
            )}

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

          {/* Description */}
          <div className="px-5 py-4">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Description</h4>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={handleDescBlur}
              placeholder="Add a more detailed description..."
              className="w-full min-h-[80px] bg-muted/20 rounded-lg p-3 text-sm border border-border/30 outline-none resize-y placeholder:text-muted-foreground/40 focus:border-primary/30 transition-colors"
              rows={3}
            />
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
                      <p className="text-sm text-muted-foreground/80 mt-0.5">{c.content}</p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* New comment */}
            <div className="flex items-start gap-2">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); postComment() }
                }}
                placeholder="Write a comment..."
                className="flex-1 bg-muted/20 rounded-lg p-2.5 text-sm border border-border/30 outline-none resize-none placeholder:text-muted-foreground/40 focus:border-primary/30 transition-colors"
                rows={2}
              />
              <button
                onClick={postComment}
                disabled={!newComment.trim()}
                className="p-2.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
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
