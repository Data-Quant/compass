'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { NotificationView } from '@/lib/security-checks/service/inbox'
import { formatDateTime } from './format'

interface NotificationsCardProps {
  notifications: NotificationView[]
  taskHref: (taskId: string) => string
  onMarkAllRead: () => void
}

export function NotificationsCard({ notifications, taskHref, onMarkAllRead }: NotificationsCardProps) {
  const unread = notifications.filter((item) => !item.read).length
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">Updates {unread > 0 && <span className="text-muted-foreground">({unread} new)</span>}</CardTitle>
        {unread > 0 && (
          <Button variant="ghost" size="sm" onClick={onMarkAllRead}>
            Mark all read
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {notifications.length === 0 && <p className="text-sm text-muted-foreground">No updates yet.</p>}
        {notifications.map((item) => (
          <div key={item.id} className="flex gap-3 text-sm">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.read ? 'bg-transparent' : 'bg-primary'}`} aria-hidden />
            <div className="min-w-0">
              <p className="font-medium text-foreground">{item.title}</p>
              <p className="text-muted-foreground">{item.body}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatDateTime(item.createdAt)}
                {item.taskId && (
                  <>
                    {' · '}
                    <Link className="underline underline-offset-2" href={taskHref(item.taskId)}>
                      Open
                    </Link>
                  </>
                )}
              </p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
