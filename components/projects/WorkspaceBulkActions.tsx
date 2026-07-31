'use client'

import { useMemo, useState } from 'react'
import { CalendarClock, Layers3, UserRoundCog, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type {
  WorkspaceBulkAction,
  WorkspacePerson,
  WorkspacePriority,
  WorkspaceProject,
  WorkspaceTask,
} from './workspace-types'

interface WorkspaceBulkActionsProps {
  selections: Array<{ project: WorkspaceProject; task: WorkspaceTask }>
  applying: boolean
  onApply: (action: WorkspaceBulkAction) => Promise<boolean>
  onClear: () => void
}

type BulkActionKind = WorkspaceBulkAction['action']

const PRIORITIES: WorkspacePriority[] = ['HIGH', 'MEDIUM', 'LOW']

export function WorkspaceBulkActions({ selections, applying, onApply, onClear }: WorkspaceBulkActionsProps) {
  const [action, setAction] = useState<BulkActionKind>('PRIORITY')
  const [priority, setPriority] = useState<WorkspacePriority>('MEDIUM')
  const [assigneeId, setAssigneeId] = useState('')
  const [days, setDays] = useState('1')

  const canReassign = selections.length > 0 && selections.every(({ project }) => project.canManage)
  const commonAssignees = useMemo(() => getCommonAssignees(selections), [selections])
  const undatedCount = selections.filter(({ task }) => !task.dueDate).length

  if (selections.length === 0) return null

  const apply = async () => {
    if (action === 'ASSIGNEE') {
      if (!canReassign || !assigneeId) return
      await onApply({ action, assigneeId: assigneeId === '__UNASSIGNED__' ? null : assigneeId })
      return
    }
    if (action === 'PRIORITY') {
      await onApply({ action, priority })
      return
    }
    const parsedDays = Number(days)
    if (!Number.isInteger(parsedDays) || parsedDays === 0) return
    await onApply({ action, days: parsedDays })
  }

  return (
    <div className="sticky top-2 z-30 flex flex-col gap-3 rounded-xl border border-primary/25 bg-card/95 p-3 shadow-lg backdrop-blur-md lg:flex-row lg:items-center">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-primary/10 px-2 text-xs font-semibold text-primary">
          {selections.length}
        </span>
        <div>
          <p className="text-sm font-semibold">Tasks selected</p>
          <p className="text-[11px] text-muted-foreground">Actions apply across visible projects.</p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center lg:justify-end">
        <Select value={action} onValueChange={(value) => setAction(value as BulkActionKind)} disabled={applying}>
          <SelectTrigger aria-label="Bulk action" className="sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="PRIORITY"><span className="inline-flex items-center gap-2"><Layers3 className="h-4 w-4" /> Change priority</span></SelectItem>
            <SelectItem value="ASSIGNEE" disabled={!canReassign}><span className="inline-flex items-center gap-2"><UserRoundCog className="h-4 w-4" /> Reassign</span></SelectItem>
            <SelectItem value="SHIFT_DUE_DATE"><span className="inline-flex items-center gap-2"><CalendarClock className="h-4 w-4" /> Shift due dates</span></SelectItem>
          </SelectContent>
        </Select>

        {action === 'PRIORITY' && (
          <Select value={priority} onValueChange={(value) => setPriority(value as WorkspacePriority)} disabled={applying}>
            <SelectTrigger aria-label="New priority" className="sm:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((item) => <SelectItem key={item} value={item}>{item[0] + item.slice(1).toLocaleLowerCase()}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        {action === 'ASSIGNEE' && (
          <Select value={assigneeId} onValueChange={setAssigneeId} disabled={applying || !canReassign}>
            <SelectTrigger aria-label="New assignee" className="sm:w-52"><SelectValue placeholder="Choose teammate" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__UNASSIGNED__">Unassigned</SelectItem>
              {commonAssignees.map((person) => <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        {action === 'SHIFT_DUE_DATE' && (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={days}
              onChange={(event) => setDays(event.target.value)}
              aria-label="Number of days to shift"
              className="w-24"
              disabled={applying}
            />
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              days {undatedCount > 0 && `· ${undatedCount} undated skipped`}
            </span>
          </div>
        )}

        <Button
          type="button"
          onClick={() => void apply()}
          disabled={applying || (action === 'ASSIGNEE' && (!canReassign || !assigneeId)) || (action === 'SHIFT_DUE_DATE' && (!Number.isInteger(Number(days)) || Number(days) === 0))}
        >
          {applying ? 'Applying...' : 'Apply'}
        </Button>
        <Button type="button" variant="ghost" size="icon" onClick={onClear} disabled={applying} aria-label="Clear task selection">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

function getCommonAssignees(selections: Array<{ project: WorkspaceProject; task: WorkspaceTask }>): WorkspacePerson[] {
  if (selections.length === 0) return []
  const projects = selections
    .map(({ project }) => project)
    .filter((project, index, list) => list.findIndex((candidate) => candidate.id === project.id) === index)

  const peopleByProject = projects.map((project) => {
    const people = [project.owner, ...project.members]
    return new Map(people.map((person) => [person.id, person]))
  })

  const first = peopleByProject[0]
  return [...first.values()]
    .filter((person) => peopleByProject.every((people) => people.has(person.id)))
    .sort((left, right) => left.name.localeCompare(right.name))
}
