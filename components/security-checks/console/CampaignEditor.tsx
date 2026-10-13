'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { EMPTY_AUDIENCE } from '@/lib/security-checks/audience'
import { FREQUENCY_LABELS } from '@/lib/security-checks/recurrence'
import { LIVE_EDITABLE_FIELDS, usesAdminSubtasks, type CampaignFields } from '@/lib/security-checks/schemas'
import { CAMPAIGN_TEMPLATES, templateFields } from '@/lib/security-checks/templates'
import { FREQUENCIES, SUBTASK_MODES, type SubtaskMode } from '@/lib/security-checks/types'
import { errorMessage, scRequest } from '../sc-api'
import { AudienceEditor } from './AudienceEditor'
import { QuestionsEditor, selectClass } from './QuestionsEditor'

const MODE_LABELS: Record<SubtaskMode, string> = {
  NONE: 'No subtasks',
  ADMIN_DEFINED: 'Admin-defined subtasks',
  EMPLOYEE_DEFINED: 'Employee-defined subtasks (+ declaration)',
  ADMIN_WITH_EMPLOYEE_ADDITIONS: 'Admin-defined, employees may add',
}

const BLANK: CampaignFields = {
  ...templateFields(CAMPAIGN_TEMPLATES[0]),
  name: '',
  control: '',
  instructions: '',
  questions: [],
  audience: EMPTY_AUDIENCE,
  firstOpenDate: null,
}

interface CampaignEditorProps {
  campaignId?: string
  initial?: CampaignFields
  status?: string
  onSaved?: () => void
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

export function CampaignEditor({ campaignId, initial, status = 'DRAFT', onSaved }: CampaignEditorProps) {
  const router = useRouter()
  const [form, setForm] = useState<CampaignFields>(initial ?? BLANK)
  const [offsets, setOffsets] = useState((initial ?? BLANK).reminderOffsets.join(', '))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const locked = status !== 'DRAFT'
  const set = (patch: Partial<CampaignFields>) => setForm((previous) => ({ ...previous, ...patch }))

  const payload = (): Partial<CampaignFields> => {
    const reminderOffsets = offsets.split(',').map((part) => Number(part.trim())).filter((n) => Number.isInteger(n) && n > 0)
    const full = { ...form, reminderOffsets, subtasks: usesAdminSubtasks(form.subtaskMode) ? form.subtasks.filter(Boolean) : [] }
    if (!locked) return full
    return Object.fromEntries(LIVE_EDITABLE_FIELDS.map((key) => [key, full[key]]))
  }

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      if (campaignId) {
        await scRequest(`/api/security-checks/console/campaigns/${campaignId}`, { method: 'PATCH', body: payload() })
        onSaved?.()
      } else {
        const created = await scRequest<{ id: string }>('/api/security-checks/console/campaigns', { method: 'POST', body: payload() })
        router.push(`/security-checks/console/campaigns/${created.id}`)
      }
    } catch (e: unknown) {
      setError(errorMessage(e, 'Could not save the campaign'))
    } finally {
      setBusy(false)
    }
  }

  const uploadImage = async (file: File) => {
    if (!campaignId) return
    setBusy(true)
    setError(null)
    try {
      const data = new FormData()
      data.append('file', file)
      const response = await fetch(`/api/security-checks/console/campaigns/${campaignId}/images`, { method: 'POST', body: data })
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error ?? 'Upload failed')
      set({ instructionImages: [...form.instructionImages, body.data] })
    } catch (e: unknown) {
      setError(errorMessage(e, 'Could not upload the image'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      {!campaignId && (
        <Card>
          <CardContent className="flex flex-wrap items-end gap-2 p-4">
            <Field label="Start from a v1 template">
              <select className={selectClass} defaultValue="" onChange={(event) => {
                const template = CAMPAIGN_TEMPLATES.find((entry) => entry.key === event.target.value)
                if (template) {
                  const fields = { ...templateFields(template), audience: form.audience, firstOpenDate: form.firstOpenDate }
                  setForm(fields)
                  setOffsets(fields.reminderOffsets.join(', '))
                }
              }}>
                <option value="" disabled>Choose a template…</option>
                {CAMPAIGN_TEMPLATES.map((template) => <option key={template.key} value={template.key}>{template.name}</option>)}
              </select>
            </Field>
          </CardContent>
        </Card>
      )}
      {locked && (
        <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
          This campaign is live. Instructions, images, the video link, reminders and the audience can still change. Questions, subtasks and scheduling are locked — clone it to make a new version.
        </p>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Definition</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Name"><Input value={form.name} disabled={locked} maxLength={200} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Control"><Input value={form.control} disabled={locked} maxLength={200} onChange={(e) => set({ control: e.target.value })} /></Field>
          <div className="sm:col-span-2">
            <Field label="Instructions" hint="Include the approved lists (browsers, apps…) here.">
              <Textarea rows={6} value={form.instructions} maxLength={20000} onChange={(e) => set({ instructions: e.target.value })} />
            </Field>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Example images</Label>
            {form.instructionImages.map((image) => (
              <div key={image.path} className="flex items-center justify-between text-sm">
                <span>{image.name}</span>
                <Button type="button" size="sm" variant="ghost" aria-label={`Remove ${image.name}`} onClick={() => set({ instructionImages: form.instructionImages.filter((entry) => entry.path !== image.path) })}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            {campaignId ? (
              <Input type="file" accept="image/png,image/jpeg" disabled={busy} onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadImage(file); e.target.value = '' }} />
            ) : (
              <p className="text-xs text-muted-foreground">Save the draft first to add images.</p>
            )}
          </div>
          <div className="sm:col-span-2">
            <Field label="How-to video link" hint="Must be in the Security team’s Google Drive folder.">
              <Input value={form.videoUrl ?? ''} placeholder="https://drive.google.com/…" onChange={(e) => set({ videoUrl: e.target.value.trim() || null })} />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Questions and subtasks</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <QuestionsEditor questions={form.questions} disabled={locked} onChange={(questions) => set({ questions })} />
          <Field label="Subtasks">
            <select className={selectClass} value={form.subtaskMode} disabled={locked} onChange={(e) => set({ subtaskMode: e.target.value as SubtaskMode })}>
              {SUBTASK_MODES.map((mode) => <option key={mode} value={mode}>{MODE_LABELS[mode]}</option>)}
            </select>
          </Field>
          {usesAdminSubtasks(form.subtaskMode) && (
            <Field label="Subtask list" hint="One per line, up to 20.">
              <Textarea rows={4} value={form.subtasks.join('\n')} disabled={locked} onChange={(e) => set({ subtasks: e.target.value.split('\n').map((line) => line.trim()) })} />
            </Field>
          )}
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-2">
              <Switch id="evidence" checked={form.evidenceRequired} disabled={locked} onCheckedChange={(checked) => set({ evidenceRequired: checked })} />
              <Label htmlFor="evidence">Evidence required</Label>
            </div>
            {form.evidenceRequired && (
              <Field label="Files per item (max 15)">
                <Input type="number" min={1} max={15} className="w-24" value={form.fileLimit} disabled={locked} onChange={(e) => set({ fileLimit: Number(e.target.value) })} />
              </Field>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Schedule and audience</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Frequency">
            <select className={selectClass} value={form.frequency} disabled={locked} onChange={(e) => set({ frequency: e.target.value as CampaignFields['frequency'] })}>
              {FREQUENCIES.map((frequency) => <option key={frequency} value={frequency}>{FREQUENCY_LABELS[frequency]}</option>)}
            </select>
          </Field>
          <Field label="Recurrence anchor">
            <select className={selectClass} value={form.recurrenceAnchor} disabled={locked} onChange={(e) => set({ recurrenceAnchor: e.target.value as CampaignFields['recurrenceAnchor'] })}>
              <option value="FIXED_CALENDAR">Fixed calendar dates</option>
              <option value="RELATIVE_TO_CLOSE">Relative to the previous cycle’s scheduled close</option>
            </select>
          </Field>
          <Field label="First open date">
            <Input type="date" value={form.firstOpenDate ?? ''} disabled={locked} onChange={(e) => set({ firstOpenDate: e.target.value || null })} />
          </Field>
          <Field label="Deadline (days after opening)">
            <Input type="number" min={1} max={180} value={form.deadlineDays} disabled={locked} onChange={(e) => set({ deadlineDays: Number(e.target.value) })} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Reminders (days before the deadline)" hint="Comma-separated, e.g. 14, 7, 1">
              <Input value={offsets} onChange={(e) => setOffsets(e.target.value)} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <AudienceEditor value={form.audience} disabled={false} onChange={(audience) => set({ audience })} />
          </div>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button disabled={busy} onClick={() => void save()}>{campaignId ? 'Save changes' : 'Create draft'}</Button>
    </div>
  )
}
