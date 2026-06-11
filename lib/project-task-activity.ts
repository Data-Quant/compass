import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { sendTaskActivityNotification } from '@/lib/project-task-notifications'

export async function recordTaskActivity(input: {
  taskId: string
  actorId: string | null
  summary: string
  kind: string
  metadata?: Prisma.InputJsonValue
  notify?: boolean
  origin?: string | null
}) {
  const activity = await prisma.taskActivity.create({
    data: {
      taskId: input.taskId,
      actorId: input.actorId,
      summary: input.summary,
      kind: input.kind,
      metadata: input.metadata,
    },
    include: { actor: { select: { id: true, name: true } } },
  })

  if (input.notify !== false) {
    try {
      await sendTaskActivityNotification({
        taskId: input.taskId,
        actorId: input.actorId,
        summary: input.summary,
        origin: input.origin,
      })
    } catch (error) {
      console.error('Failed to send task activity notification:', error)
    }
  }

  return activity
}
