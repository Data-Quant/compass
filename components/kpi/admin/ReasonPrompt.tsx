'use client'

import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Textarea } from '@/components/ui/textarea'

interface ReasonPromptProps { title: string; submitLabel: string; onClose: () => void; onSubmit: (reason: string) => Promise<void> }

export function ReasonPrompt({ title, submitLabel, onClose, onSubmit }: ReasonPromptProps) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      await onSubmit(reason.trim())
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={title}>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="prompt-reason">Reason</Label>
          <Textarea id="prompt-reason" required minLength={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : submitLabel}</Button>
        </div>
      </form>
    </Modal>
  )
}
