'use client'

import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Textarea } from '@/components/ui/textarea'

export interface GoalFormValues { title: string; description: string }

interface GoalFormDialogProps {
  initial?: GoalFormValues
  onClose: () => void
  onSubmit: (values: GoalFormValues) => Promise<void>
}

export function GoalFormDialog({ initial, onClose, onSubmit }: GoalFormDialogProps) {
  const [values, setValues] = useState<GoalFormValues>(initial ?? { title: '', description: '' })
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      await onSubmit({ title: values.title.trim(), description: values.description.trim() })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={initial ? 'Edit goal' : 'New goal'}>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="goal-title">Goal</Label>
          <Input id="goal-title" value={values.title} onChange={(e) => setValues({ ...values, title: e.target.value })} required minLength={3} maxLength={200} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="goal-description">Description (optional)</Label>
          <Textarea id="goal-description" value={values.description} onChange={(e) => setValues({ ...values, description: e.target.value })} maxLength={2000} />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save goal'}</Button>
        </div>
      </form>
    </Modal>
  )
}
