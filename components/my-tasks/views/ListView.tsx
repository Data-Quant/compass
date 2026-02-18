'use client'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { SMART_BUCKET_LABELS, groupTasksByBucket } from '@/lib/my-tasks/buckets'
import type { MyTaskRecord, SmartBucket } from '@/lib/my-tasks/types'
import { CalendarDays, MessageSquare } from 'lucide-react'

interface MyTasksListViewProps {
  tasks: MyTaskRecord[]
  onTaskClick: (task: MyTaskRecord) => void
}

const BUCKET_ORDER: SmartBucket[] = ['RECENTLY_ASSIGNED', 'DO_TODAY', 'DO_NEXT_WEEK', 'DO_LATER']

function priorityTone(priority: string): string {
  if (priority === 'URGENT') return 'bg-red-500/10 text-red-400 border-red-500/20'
  if (priority === 'HIGH') return 'bg-orange-500/10 text-orange-400 border-orange-500/20'
  if (priority === 'LOW') return 'bg-slate-500/10 text-slate-300 border-slate-500/20'
  return 'bg-blue-500/10 text-blue-300 border-blue-500/20'
}

function statusTone(status: string): string {
  if (status === 'DONE') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
  if (status === 'IN_PROGRESS') return 'bg-blue-500/10 text-blue-300 border-blue-500/20'
  return 'bg-muted/40 text-muted-foreground border-border/60'
}

function formatRange(startDate: string | null, dueDate: string | null): string {
  if (startDate && dueDate) {
    return `${new Date(startDate).toLocaleDateString()} - ${new Date(dueDate).toLocaleDateString()}`
  }
  if (dueDate) return new Date(dueDate).toLocaleDateString()
  if (startDate) return new Date(startDate).toLocaleDateString()
  return 'No date'
}

export function MyTasksListView({ tasks, onTaskClick }: MyTasksListViewProps) {
  const grouped = groupTasksByBucket(tasks)

  return (
    <div className="space-y-4">
      {BUCKET_ORDER.map((bucket) => {
        const bucketTasks = grouped[bucket]
        if (bucketTasks.length === 0) return null
        return (
          <Card key={bucket} className="border-border/60 bg-card/70">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                {SMART_BUCKET_LABELS[bucket]}
                <span className="text-xs text-muted-foreground">{bucketTasks.length}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Task</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Comments</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bucketTasks.map((task) => (
                    <TableRow key={task.id} className="cursor-pointer" onClick={() => onTaskClick(task)}>
                      <TableCell>
                        <div className="min-w-[180px]">
                          <p className="font-medium text-sm">{task.title}</p>
                          {task.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{task.description}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {task.project.color && (
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: task.project.color }} />
                          )}
                          {task.project.name}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <CalendarDays className="w-3.5 h-3.5" />
                          {formatRange(task.startDate, task.dueDate)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${priorityTone(task.priority)}`}>
                          {task.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${statusTone(task.status)}`}>
                          {task.status.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <MessageSquare className="w-3 h-3" />
                          {task._count.comments}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
