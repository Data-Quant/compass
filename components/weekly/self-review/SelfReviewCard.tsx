'use client'

import { useCallback, useEffect, useState } from 'react'
import { Send } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatKarachiDate } from '@/lib/weekly/format'
import type { MySelfReview } from '@/lib/weekly/service/self-review'
import { errorMessage, weeklyRequest } from '../weekly-api'

const MIN_WORDS = 30
const countWords = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0)

function recipientsText(names: string[]): string {
  if (names.length === 0) return 'HR'
  return `${names.join(' and ')} and HR`
}

/**
 * UX spec, section 12: once a month, one self-evaluation question in three short parts. It goes to the person's leads
 * and HR the moment it is sent, and cannot be changed. It is never scored.
 */
export function SelfReviewCard() {
  const [data, setData] = useState<MySelfReview | null>(null)
  const [answers, setAnswers] = useState(['', '', ''])
  const [discuss, setDiscuss] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      setData(await weeklyRequest<MySelfReview>('/api/weekly/self-review'))
    } catch {
      setData(null)
    }
  }, [])
  useEffect(() => {
    void load()
  }, [load])

  async function send() {
    if (!data?.current) return
    setConfirming(false)
    setSaving(true)
    try {
      await weeklyRequest('/api/weekly/self-review', { method: 'POST', body: { month: data.current.month, answers, wantsDiscussion: discuss } })
      toast.success(`Sent to ${recipientsText(data.current.recipients.map((p) => p.name))}. You can’t edit it now.`)
      setAnswers(['', '', ''])
      setDiscuss(false)
      await load()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not send it'))
    } finally {
      setSaving(false)
    }
  }

  if (!data || (!data.current && data.history.length === 0)) return null
  const current = data.current
  const words = countWords(answers.join(' '))
  const to = current ? recipientsText(current.recipients.map((p) => p.name)) : ''
  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        {current && (
          <div className="space-y-4">
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Self-evaluation · goes to {to}</p>
              <h2 className="text-lg font-semibold">{current.monthName}: {current.title}</h2>
              <p className="text-sm text-muted-foreground">Not anonymous and never scored. Only {to} read it; your peers and team never see it.</p>
            </div>
            {current.parts.map((part, i) => (
              <div key={i} className="space-y-1.5">
                <Label htmlFor={`self-review-${i}`} className="text-sm font-normal">{part}</Label>
                <Textarea id={`self-review-${i}`} rows={3} maxLength={3000} value={answers[i]} onChange={(e) => setAnswers(answers.map((a, j) => (j === i ? e.target.value : a)))} />
              </div>
            ))}
            {current.discussOption && (
              <div className="flex items-center gap-2">
                <Checkbox id="self-review-discuss" checked={discuss} onCheckedChange={(v) => setDiscuss(v === true)} />
                <Label htmlFor="self-review-discuss" className="text-sm font-normal">I’d like to discuss this with my lead</Label>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className={words >= MIN_WORDS ? 'text-xs text-muted-foreground' : 'text-xs text-amber-700 dark:text-amber-400'}>{words} of at least {MIN_WORDS} words</p>
              <Button disabled={saving || words < MIN_WORDS} onClick={() => setConfirming(true)}><Send className="mr-1.5 h-4 w-4" /> Send to {to}</Button>
            </div>
          </div>
        )}
        {data.history.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-semibold">Your self-evaluations this quarter</p>
            <ul className="space-y-2">
              {data.history.map((h) => (
                <li key={h.id} className="rounded-lg border p-3">
                  <details>
                    <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="font-medium">{h.monthName}: {h.title}</span>
                      <span className="text-xs text-muted-foreground">
                        Sent to {recipientsText(h.reads.map((r) => r.lead.name))} on {formatKarachiDate(h.submittedAt)}. You can’t edit it now.
                      </span>
                    </summary>
                    <div className="mt-3 space-y-2 text-sm">
                      {h.parts.map((part, i) => (
                        <div key={i}>
                          <p className="text-xs text-muted-foreground">{part}</p>
                          <p className="whitespace-pre-wrap">{h.answers[i]}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                  {h.reads.map((r) => (
                    <div key={r.lead.id} className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <Badge variant={r.readAt ? 'secondary' : 'outline'}>{r.lead.name}: {r.readAt ? 'read' : 'not read yet'}</Badge>
                      {r.reply && <span className="rounded-md bg-muted px-2 py-1 text-sm">“{r.reply}”</span>}
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
      <ConfirmDialog
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => void send()}
        title="Send your self-evaluation?"
        message={`It goes to ${to} now, and you can’t change it afterwards.`}
        confirmText="Send"
        variant="info"
      />
    </Card>
  )
}
