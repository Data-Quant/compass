'use client'

import { useState } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { SectionGroup } from './SectionGroup'
import type { PanelTask } from './TaskDetailPanel'

interface Section {
  id: string
  name: string
  orderIndex: number
}

interface ListViewProps {
  projectId: string
  tasks: PanelTask[]
  sections: Section[]
  onTaskClick: (task: PanelTask) => void
  onTasksChange: () => void
}

export function ListView({ projectId, tasks, sections, onTaskClick, onTasksChange }: ListViewProps) {
  const [addingSectionName, setAddingSectionName] = useState('')
  const [showSectionInput, setShowSectionInput] = useState(false)

  // Group tasks by section
  const unsectionedTasks = tasks.filter((t) => !t.sectionId)
  const sectionedTasks = sections.map((s) => ({
    ...s,
    tasks: tasks.filter((t) => t.sectionId === s.id),
  }))

  const handleAddTask = async (title: string, sectionId: string | null) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, sectionId }),
      })
      const data = await res.json()
      if (data.success) {
        onTasksChange()
      }
    } catch {
      toast.error('Failed to create task')
    }
  }

  const handleAddSection = async () => {
    if (!addingSectionName.trim()) {
      setShowSectionInput(false)
      return
    }
    try {
      const res = await fetch(`/api/projects/${projectId}/sections`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: addingSectionName.trim() }),
      })
      const data = await res.json()
      if (data.success) {
        onTasksChange()
        setAddingSectionName('')
        setShowSectionInput(false)
      }
    } catch {
      toast.error('Failed to create section')
    }
  }

  const handleDeleteSection = async (sectionId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/sections?sectionId=${sectionId}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        onTasksChange()
        toast.success('Section deleted')
      }
    } catch {
      toast.error('Failed to delete section')
    }
  }

  const handleRenameSection = async (sectionId: string, name: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/sections`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionId, name }),
      })
      const data = await res.json()
      if (data.success) onTasksChange()
    } catch {
      toast.error('Failed to rename section')
    }
  }

  return (
    <div className="space-y-1">
      {/* Unsectioned tasks */}
      {(unsectionedTasks.length > 0 || sections.length === 0) && (
        <SectionGroup
          sectionId={null}
          sectionName="Tasks"
          tasks={unsectionedTasks}
          onTaskClick={onTaskClick}
          onAddTask={handleAddTask}
          collapsible={sections.length > 0}
        />
      )}

      {/* Sections */}
      {sectionedTasks.map((section) => (
        <SectionGroup
          key={section.id}
          sectionId={section.id}
          sectionName={section.name}
          tasks={section.tasks}
          onTaskClick={onTaskClick}
          onAddTask={handleAddTask}
          onDeleteSection={handleDeleteSection}
          onRenameSection={handleRenameSection}
        />
      ))}

      {/* Add section */}
      {showSectionInput ? (
        <div className="flex items-center gap-2 px-4 py-2">
          <input
            autoFocus
            value={addingSectionName}
            onChange={(e) => setAddingSectionName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddSection()
              if (e.key === 'Escape') { setShowSectionInput(false); setAddingSectionName('') }
            }}
            onBlur={handleAddSection}
            placeholder="Section name"
            className="flex-1 bg-transparent border-b border-primary/40 outline-none text-sm font-semibold py-1 placeholder:text-muted-foreground/40"
          />
        </div>
      ) : (
        <button
          onClick={() => setShowSectionInput(true)}
          className="flex items-center gap-2 px-4 py-2.5 text-sm text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/20 rounded-lg transition-colors w-full"
        >
          <Plus className="w-4 h-4" />
          Add section
        </button>
      )}
    </div>
  )
}
