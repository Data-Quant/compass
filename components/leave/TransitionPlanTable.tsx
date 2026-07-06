'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { TransitionTask } from '@/lib/leave-transition-plan'
import { Plus, Trash2 } from 'lucide-react'

interface Props {
  tasks: TransitionTask[]
  onChange: (tasks: TransitionTask[]) => void
  disabled?: boolean
}

const EMPTY_TASK: TransitionTask = {
  taskDetails: '',
  projectDept: '',
  assignedTo: '',
  accepted: null,
  deadline: null,
  completed: null,
  variance: '',
  links: '',
}

function ynValue(v: boolean | null): string {
  return v === null ? 'na' : v ? 'yes' : 'no'
}
function ynParse(v: string): boolean | null {
  return v === 'yes' ? true : v === 'no' ? false : null
}

export function TransitionPlanTable({ tasks, onChange, disabled }: Props) {
  const update = (i: number, patch: Partial<TransitionTask>) =>
    onChange(tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)))
  const remove = (i: number) => onChange(tasks.filter((_, j) => j !== i))
  const add = () => onChange([...tasks, { ...EMPTY_TASK }])

  return (
    <div className="space-y-4">
      {tasks.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No handover tasks yet. Add a task for each thing that needs covering while you are away.
        </p>
      )}

      {tasks.map((task, i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Task {i + 1}
            </span>
            {!disabled && (
              <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)}>
                <Trash2 className="w-4 h-4 text-muted-foreground" />
              </Button>
            )}
          </div>

          <div>
            <Label className="mb-1 block text-xs">Task Details</Label>
            <Textarea
              value={task.taskDetails}
              onChange={(e) => update(i, { taskDetails: e.target.value })}
              disabled={disabled}
              rows={2}
              placeholder="What needs to be handled"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1 block text-xs">Project / Dept.</Label>
              <Input
                value={task.projectDept}
                onChange={(e) => update(i, { projectDept: e.target.value })}
                disabled={disabled}
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Assigned To</Label>
              <Input
                value={task.assignedTo}
                onChange={(e) => update(i, { assignedTo: e.target.value })}
                disabled={disabled}
                placeholder="Who is covering it"
              />
            </div>
            <div>
              <Label className="mb-1 block text-xs">Deadline</Label>
              <Input
                type="date"
                value={task.deadline ?? ''}
                onChange={(e) => update(i, { deadline: e.target.value || null })}
                disabled={disabled}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="mb-1 block text-xs">Accepted</Label>
                <Select value={ynValue(task.accepted)} onValueChange={(v) => update(i, { accepted: ynParse(v) })} disabled={disabled}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="na">—</SelectItem>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1 block text-xs">Completed</Label>
                <Select value={ynValue(task.completed)} onValueChange={(v) => update(i, { completed: ynParse(v) })} disabled={disabled}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="na">—</SelectItem>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {task.completed === false && (
            <div>
              <Label className="mb-1 block text-xs">Explanation if not completed / variance</Label>
              <Textarea
                value={task.variance}
                onChange={(e) => update(i, { variance: e.target.value })}
                disabled={disabled}
                rows={2}
              />
            </div>
          )}

          <div>
            <Label className="mb-1 block text-xs">Relevant Links / Comments</Label>
            <Textarea
              value={task.links}
              onChange={(e) => update(i, { links: e.target.value })}
              disabled={disabled}
              rows={2}
            />
          </div>
        </div>
      ))}

      {!disabled && (
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="w-4 h-4" /> Add task
        </Button>
      )}
    </div>
  )
}
