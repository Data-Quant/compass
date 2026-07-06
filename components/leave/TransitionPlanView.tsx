'use client'

import { Badge } from '@/components/ui/badge'
import type { TransitionTask } from '@/lib/leave-transition-plan'

type LeadStatus = 'PENDING' | 'APPROVED' | 'DISAPPROVED'

interface Props {
  tasks: TransitionTask[]
  submittedAt?: string | null
  leadStatus?: LeadStatus
  disapprovalReason?: string | null
  generalNotes?: string | null
}

function yn(v: boolean | null): string {
  return v === null ? '—' : v ? 'Yes' : 'No'
}

function leadStatusBadge(status: LeadStatus) {
  if (status === 'APPROVED') {
    return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Approved by Team Lead</Badge>
  }
  if (status === 'DISAPPROVED') {
    return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Disapproved by Team Lead</Badge>
  }
  return <Badge variant="secondary">Awaiting Team Lead review</Badge>
}

export function TransitionPlanView({
  tasks,
  submittedAt,
  leadStatus = 'PENDING',
  disapprovalReason,
  generalNotes,
}: Props) {
  const hasTasks = Array.isArray(tasks) && tasks.length > 0

  if (!hasTasks && !generalNotes?.trim()) {
    return <p className="text-sm text-muted-foreground">No transition plan added yet.</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {submittedAt ? (
          <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Submitted</Badge>
        ) : (
          <Badge variant="secondary">Draft — not submitted</Badge>
        )}
        {submittedAt && leadStatusBadge(leadStatus)}
      </div>

      {leadStatus === 'DISAPPROVED' && disapprovalReason?.trim() && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <span className="font-medium">Team Lead feedback:</span> {disapprovalReason}
        </div>
      )}

      {hasTasks && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Task</th>
                <th className="py-2 pr-3 font-medium">Project / Dept.</th>
                <th className="py-2 pr-3 font-medium">Assigned To</th>
                <th className="py-2 pr-3 font-medium">Accepted</th>
                <th className="py-2 pr-3 font-medium">Deadline</th>
                <th className="py-2 pr-3 font-medium">Completed</th>
                <th className="py-2 font-medium">Links / Comments</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task, i) => (
                <tr key={i} className="border-b border-border/60 align-top">
                  <td className="py-2 pr-3">
                    <div className="whitespace-pre-wrap">{task.taskDetails || '—'}</div>
                    {task.completed === false && task.variance?.trim() && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        <span className="font-medium">Variance:</span> {task.variance}
                      </div>
                    )}
                  </td>
                  <td className="py-2 pr-3">{task.projectDept || '—'}</td>
                  <td className="py-2 pr-3">{task.assignedTo || '—'}</td>
                  <td className="py-2 pr-3">{yn(task.accepted)}</td>
                  <td className="py-2 pr-3">{task.deadline || '—'}</td>
                  <td className="py-2 pr-3">{yn(task.completed)}</td>
                  <td className="py-2 whitespace-pre-wrap">{task.links || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {generalNotes?.trim() && (
        <div className="text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            General notes
          </span>
          <p className="mt-1 whitespace-pre-wrap">{generalNotes}</p>
        </div>
      )}
    </div>
  )
}
