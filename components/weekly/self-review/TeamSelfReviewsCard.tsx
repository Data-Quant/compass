'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { formatKarachiDate } from '@/lib/weekly/format'
import type { TeamSelfReviewItem } from '@/lib/weekly/service/self-review'
import { errorMessage, weeklyRequest } from '../weekly-api'

/** For a lead: the self-evaluations their team sent them, unread first. Mark one read, or reply with a short note. */
export function TeamSelfReviewsCard() {
  const [items, setItems] = useState<TeamSelfReviewItem[] | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setItems((await weeklyRequest<{ items: TeamSelfReviewItem[] }>('/api/weekly/self-review/team')).items)
    } catch {
      setItems(null)
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  async function post(body: Record<string, unknown>, success?: string) {
    setBusy(true)
    try {
      await weeklyRequest('/api/weekly/self-review/team', { method: 'POST', body })
      if (success) toast.success(success)
      await load()
      return true
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save'))
      return false
    } finally {
      setBusy(false)
    }
  }

  function toggle(item: TeamSelfReviewItem) {
    const next = open === item.id ? null : item.id
    setOpen(next)
    setReply('')
    if (next && !item.readAt) void post({ action: 'read', reviewId: item.id })
  }

  if (!items || items.length === 0) return null
  const unread = items.filter((i) => !i.readAt).length
  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Your team’s self-evaluations</h2>
            <p className="text-sm text-muted-foreground">Sent to you and HR. Opening one marks it read; you can reply with a short note they see.</p>
          </div>
          {unread > 0 && <Badge>{unread} unread</Badge>}
        </div>
        <ul className="divide-y rounded-lg border">
          {items.map((item) => (
            <li key={item.id} className="p-3">
              <button type="button" className="flex w-full flex-wrap items-center justify-between gap-2 text-left" onClick={() => toggle(item)} aria-expanded={open === item.id}>
                <span className="text-sm">
                  <span className={item.readAt ? 'font-medium' : 'font-semibold'}>{item.person.name}</span>
                  <span className="text-muted-foreground"> · {item.monthName}: {item.title}</span>
                </span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {item.wantsDiscussion && <Badge variant="secondary">Wants to discuss</Badge>}
                  {!item.readAt && <Badge variant="outline">New</Badge>}
                  {formatKarachiDate(item.submittedAt)}
                </span>
              </button>
              {open === item.id && (
                <div className="mt-3 space-y-3">
                  {item.parts.map((part, i) => (
                    <div key={i} className="text-sm">
                      <p className="text-xs text-muted-foreground">{part}</p>
                      <p className="whitespace-pre-wrap">{item.answers[i]}</p>
                    </div>
                  ))}
                  {item.reply ? (
                    <p className="rounded-md bg-muted p-2 text-sm">Your reply: “{item.reply}”</p>
                  ) : (
                    <div className="space-y-2">
                      <Textarea rows={2} maxLength={1000} placeholder={`A short reply ${item.person.name.split(' ')[0]} will see (optional)`} value={reply} onChange={(e) => setReply(e.target.value)} />
                      <div className="flex justify-end">
                        <Button size="sm" disabled={busy || !reply.trim()} onClick={() => void post({ action: 'reply', reviewId: item.id, text: reply.trim() }, 'Reply sent').then((ok) => ok && setReply(''))}>Send reply</Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
