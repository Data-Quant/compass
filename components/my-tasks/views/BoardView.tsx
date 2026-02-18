'use client'

import { useMemo, useState } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SMART_BUCKET_LABELS, groupTasksByBucket } from '@/lib/my-tasks/buckets'
import type { MyTaskRecord, SmartBucket } from '@/lib/my-tasks/types'
import { CalendarDays, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MyTasksBoardViewProps {
  tasks: MyTaskRecord[]
  movingTaskId?: string | null
  onTaskClick: (task: MyTaskRecord) => void
  onMoveTask: (task: MyTaskRecord, targetBucket: SmartBucket) => Promise<void> | void
}

const BUCKET_ORDER: SmartBucket[] = ['RECENTLY_ASSIGNED', 'DO_TODAY', 'DO_NEXT_WEEK', 'DO_LATER']

const BUCKET_TONE: Record<SmartBucket, string> = {
  RECENTLY_ASSIGNED: 'border-purple-500/20 bg-purple-500/5',
  DO_TODAY: 'border-amber-500/20 bg-amber-500/5',
  DO_NEXT_WEEK: 'border-blue-500/20 bg-blue-500/5',
  DO_LATER: 'border-border/60 bg-muted/20',
}

function TaskCard({
  task,
  onClick,
  dragging,
  disabled,
}: {
  task: MyTaskRecord
  onClick?: () => void
  dragging?: boolean
  disabled?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border/50 bg-card p-3 transition-colors',
        !dragging && !disabled && 'cursor-pointer hover:border-primary/30',
        dragging && 'opacity-50',
        disabled && 'opacity-60'
      )}
      onClick={disabled ? undefined : onClick}
    >
      <p className="text-sm font-medium line-clamp-2">{task.title}</p>
      <p className="text-xs text-muted-foreground mt-1">{task.project.name}</p>
      <div className="mt-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <CalendarDays className="w-3.5 h-3.5" />
          {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No due date'}
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <MessageSquare className="w-3.5 h-3.5" />
          {task._count.comments}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Badge variant="outline" className="text-[10px]">{task.status.replace('_', ' ')}</Badge>
        <Badge variant="outline" className="text-[10px]">{task.priority}</Badge>
      </div>
    </div>
  )
}

function SortableTaskCard({
  task,
  disabled,
  onClick,
}: {
  task: MyTaskRecord
  disabled?: boolean
  onClick: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard task={task} onClick={onClick} dragging={isDragging} disabled={disabled} />
    </div>
  )
}

export function MyTasksBoardView({
  tasks,
  movingTaskId,
  onTaskClick,
  onMoveTask,
}: MyTasksBoardViewProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)

  const grouped = useMemo(() => groupTasksByBucket(tasks), [tasks])
  const bucketByTaskId = useMemo(() => {
    const map = new Map<string, SmartBucket>()
    for (const bucket of BUCKET_ORDER) {
      for (const task of grouped[bucket]) map.set(task.id, bucket)
    }
    return map
  }, [grouped])

  const activeTask = activeTaskId ? tasks.find((task) => task.id === activeTaskId) || null : null

  const handleDragStart = (event: DragStartEvent) => {
    setActiveTaskId(String(event.active.id))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveTaskId(null)
    const taskId = String(event.active.id)
    const sourceBucket = bucketByTaskId.get(taskId)
    if (!sourceBucket || !event.over) return

    const overId = String(event.over.id)
    const targetBucket = (BUCKET_ORDER.includes(overId as SmartBucket)
      ? overId
      : bucketByTaskId.get(overId)) as SmartBucket | undefined

    if (!targetBucket || targetBucket === sourceBucket) return
    const task = tasks.find((item) => item.id === taskId)
    if (!task) return
    onMoveTask(task, targetBucket)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
        {BUCKET_ORDER.map((bucket) => (
          <BoardColumn
            key={bucket}
            bucket={bucket}
            tasks={grouped[bucket]}
            movingTaskId={movingTaskId}
            onTaskClick={onTaskClick}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTask ? <TaskCard task={activeTask} dragging /> : null}
      </DragOverlay>
    </DndContext>
  )
}

function BoardColumn({
  bucket,
  tasks,
  movingTaskId,
  onTaskClick,
}: {
  bucket: SmartBucket
  tasks: MyTaskRecord[]
  movingTaskId?: string | null
  onTaskClick: (task: MyTaskRecord) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: bucket })

  return (
    <Card className={cn('border', BUCKET_TONE[bucket], isOver && 'ring-1 ring-primary/50')}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center justify-between">
          <span>{SMART_BUCKET_LABELS[bucket]}</span>
          <span className="text-xs text-muted-foreground">{tasks.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent ref={setNodeRef} className="pt-0 min-h-[280px] space-y-2">
        <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <SortableTaskCard
              key={task.id}
              task={task}
              onClick={() => onTaskClick(task)}
              disabled={movingTaskId === task.id}
            />
          ))}
        </SortableContext>
      </CardContent>
    </Card>
  )
}
