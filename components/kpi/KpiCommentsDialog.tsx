'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Textarea } from '@/components/ui/textarea'
import type { KpiCommentView, KpiView } from '@/lib/kpi/view-types'
import { errorMessage, kpiRequest } from './kpi-api'

interface KpiCommentsDialogProps { kpi: KpiView; onClose: () => void; onChanged?: () => Promise<void> }

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** One thread per KPI: Execution, HR, the setter and owners read and write here. */
export function KpiCommentsDialog({ kpi, onClose, onChanged }: KpiCommentsDialogProps) {
  const [comments, setComments] = useState<KpiCommentView[] | null>(null)
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const url = `/api/kpi/kpis/${kpi.id}/comments`

  const load = useCallback(async () => {
    try {
      setComments((await kpiRequest<{ comments: KpiCommentView[] }>(url)).comments)
    } catch (e) {
      toast.error(errorMessage(e, 'Could not load comments'))
      setComments([])
    }
  }, [url])

  useEffect(() => {
    void load()
  }, [load])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      setComments((await kpiRequest<{ comments: KpiCommentView[] }>(url, { method: 'POST', body: { body: body.trim() } })).comments)
      setBody('')
      await onChanged?.()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not add the comment'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={`Comments: ${kpi.title}`}>
      <div className="space-y-4">
        {comments === null && <p className="text-sm text-muted-foreground">Loading comments…</p>}
        {comments?.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
        {comments && comments.length > 0 && (
          <ul className="max-h-72 space-y-3 overflow-y-auto">
            {comments.map((comment) => (
              <li key={comment.id} className="rounded-md bg-muted p-3 text-sm">
                <p className="text-xs text-muted-foreground">{comment.author.name} · {when(comment.createdAt)}</p>
                <p className="whitespace-pre-wrap">{comment.body}</p>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={submit} className="space-y-2">
          <Label htmlFor="kpi-comment">Add a comment</Label>
          <Textarea id="kpi-comment" required maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Close</Button>
            <Button type="submit" disabled={saving || !body.trim()}>{saving ? 'Posting…' : 'Post comment'}</Button>
          </div>
        </form>
      </div>
    </Modal>
  )
}
