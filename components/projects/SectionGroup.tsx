'use client'

import { useState, useRef } from 'react'
import { ChevronRight, Plus, GripVertical, MoreHorizontal, Trash2, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import type { PanelTask } from './TaskDetailPanel'
import { TaskRow } from './TaskRow'

interface SectionGroupProps {
  sectionId: string | null
  sectionName: string
  tasks: PanelTask[]
  onTaskClick: (task: PanelTask) => void
  onAddTask: (title: string, sectionId: string | null) => void
  onDeleteSection?: (sectionId: string) => void
  onRenameSection?: (sectionId: string, name: string) => void
  collapsible?: boolean
}

export function SectionGroup({
  sectionId, sectionName, tasks, onTaskClick, onAddTask,
  onDeleteSection, onRenameSection, collapsible = true,
}: SectionGroupProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [addingTask, setAddingTask] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(sectionName)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleAdd = () => {
    if (newTaskTitle.trim()) {
      onAddTask(newTaskTitle.trim(), sectionId)
      setNewTaskTitle('')
    }
    setAddingTask(false)
  }

  const handleRename = () => {
    if (editName.trim() && editName.trim() !== sectionName && sectionId) {
      onRenameSection?.(sectionId, editName.trim())
    }
    setEditing(false)
  }

  return (
    <div className="mb-1">
      {/* Section Header */}
      <div className="group flex items-center gap-1 px-2 py-2 hover:bg-muted/30 rounded-lg transition-colors">
        {collapsible && (
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="p-0.5 rounded hover:bg-muted/50 transition-colors"
          >
            <ChevronRight className={cn(
              'w-4 h-4 text-muted-foreground transition-transform duration-200',
              !collapsed && 'rotate-90'
            )} />
          </button>
        )}

        {editing ? (
          <input
            autoFocus
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setEditing(false) }}
            className="text-sm font-semibold bg-transparent border-b border-primary/50 outline-none flex-1 px-1"
          />
        ) : (
          <span className="text-sm font-semibold text-foreground/80 flex-1 px-1">
            {sectionName}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {tasks.length}
            </span>
          </span>
        )}

        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setAddingTask(true)}
            className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
            title="Add task"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          {sectionId && (
            <>
              <button
                onClick={() => { setEditName(sectionName); setEditing(true) }}
                className="p-1 rounded hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                title="Rename section"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onDeleteSection?.(sectionId)}
                className="p-1 rounded hover:bg-red-400/10 text-muted-foreground hover:text-red-400 transition-colors"
                title="Delete section"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tasks */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={false}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pl-2">
              {tasks.map((task) => (
                <TaskRow key={task.id} task={task} onClick={() => onTaskClick(task)} />
              ))}

              {/* Inline add */}
              {addingTask ? (
                <div className="flex items-center gap-2 px-3 py-2">
                  <input
                    ref={inputRef}
                    autoFocus
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleAdd()
                      if (e.key === 'Escape') { setAddingTask(false); setNewTaskTitle('') }
                    }}
                    onBlur={handleAdd}
                    placeholder="Task name"
                    className="flex-1 bg-transparent border-b border-primary/40 outline-none text-sm py-1 placeholder:text-muted-foreground/40"
                  />
                </div>
              ) : (
                <button
                  onClick={() => setAddingTask(true)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/20 rounded-md transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add task
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
