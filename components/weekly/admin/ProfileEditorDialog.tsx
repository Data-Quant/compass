'use client'

import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Textarea } from '@/components/ui/textarea'
import { LEVEL_KEYS, LEVEL_LABELS, type LevelKey, type ProfileLevels } from '@/lib/weekly/profile'
import type { ContentCompetency, ProfileView } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'

type EditableLevel = { behaviours: string; consistency: string; outcome: string; evidence: string }
type Editable = Record<LevelKey, EditableLevel>
const TEXT_FIELDS = [['behaviours', 'Behaviours'], ['consistency', 'Consistency'], ['outcome', 'Outcome and impact']] as const

function toEditable(levels: ProfileLevels): Editable {
  return Object.fromEntries(LEVEL_KEYS.map((key) => [key, { ...levels[key], evidence: levels[key].evidence.join('\n') }])) as Editable
}

function toLevels(editable: Editable): ProfileLevels {
  return Object.fromEntries(
    LEVEL_KEYS.map((key) => [
      key,
      {
        behaviours: editable[key].behaviours.trim(),
        consistency: editable[key].consistency.trim(),
        outcome: editable[key].outcome.trim(),
        evidence: editable[key].evidence.split('\n').map((line) => line.trim()).filter(Boolean),
      },
    ]),
  ) as ProfileLevels
}

interface ProfileEditorDialogProps { topic: ContentCompetency; profile: ProfileView; onClose: () => void; onSaved: () => Promise<void> }

export function ProfileEditorDialog({ topic, profile, onClose, onSaved }: ProfileEditorDialogProps) {
  const [levels, setLevels] = useState<Editable>(() => toEditable(profile.levels))
  const [insufficient, setInsufficient] = useState(profile.insufficientDefinition)
  const [saving, setSaving] = useState(false)

  function set(key: LevelKey, field: keyof EditableLevel, value: string) {
    setLevels((current) => ({ ...current, [key]: { ...current[key], [field]: value } }))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      await weeklyRequest(`/api/admin/weekly/competencies/${topic.id}/profile`, { method: 'PUT', body: { levels: toLevels(levels), insufficientDefinition: insufficient.trim() } })
      toast.success('Draft saved. Approve it to use it.')
      await onSaved()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save the draft'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={`Profile: ${topic.name}`} size="xl">
      <form onSubmit={submit} className="max-h-[70vh] space-y-6 overflow-y-auto pr-1">
        {LEVEL_KEYS.map((key) => (
          <fieldset key={key} className="space-y-2 rounded-md border p-3">
            <legend className="px-1 text-sm font-semibold">{key} · {LEVEL_LABELS[key]}</legend>
            {topic.hrDescriptions[key] && <p className="text-xs text-muted-foreground">HR’s current description: {topic.hrDescriptions[key]}</p>}
            {TEXT_FIELDS.map(([field, label]) => (
              <div key={field} className="space-y-1">
                <Label htmlFor={`${topic.id}-${key}-${field}`}>{label}</Label>
                <Textarea id={`${topic.id}-${key}-${field}`} rows={2} value={levels[key][field]} onChange={(e) => set(key, field, e.target.value)} required />
              </div>
            ))}
            <div className="space-y-1">
              <Label htmlFor={`${topic.id}-${key}-evidence`}>Evidence examples (one per line)</Label>
              <Textarea id={`${topic.id}-${key}-evidence`} rows={2} value={levels[key].evidence} onChange={(e) => set(key, 'evidence', e.target.value)} />
            </div>
          </fieldset>
        ))}
        <div className="space-y-1">
          <Label htmlFor={`${topic.id}-insufficient`}>When an answer is not enough evidence</Label>
          <Textarea id={`${topic.id}-insufficient`} rows={2} value={insufficient} onChange={(e) => setInsufficient(e.target.value)} required />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save draft'}</Button>
        </div>
      </form>
    </Modal>
  )
}
