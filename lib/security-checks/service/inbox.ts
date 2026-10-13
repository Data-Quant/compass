// In-app notification inbox shown on the Security Checks page.
import { prisma } from '@/lib/db'
import type { Db } from './db'

export interface NotificationView {
  id: string
  kind: string
  title: string
  body: string
  taskId: string | null
  createdAt: string
  read: boolean
}

export async function listNotifications(userId: string, db: Db = prisma): Promise<NotificationView[]> {
  const rows = await db.securityNotification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 30 })
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    taskId: row.taskId,
    createdAt: row.createdAt.toISOString(),
    read: row.readAt !== null,
  }))
}

export async function unreadCount(userId: string, db: Db = prisma): Promise<number> {
  return db.securityNotification.count({ where: { userId, readAt: null } })
}

export async function markRead(userId: string, ids: readonly string[] | 'all', now: Date, db: Db = prisma): Promise<number> {
  const result = await db.securityNotification.updateMany({
    where: { userId, readAt: null, ...(ids === 'all' ? {} : { id: { in: [...ids] } }) },
    data: { readAt: now },
  })
  return result.count
}
