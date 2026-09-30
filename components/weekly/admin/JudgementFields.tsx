'use client'

import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { LEVEL_KEYS, LEVEL_LABELS } from '@/lib/weekly/profile'

export interface Judgement { hrSufficiency: 'SUFFICIENT' | 'INSUFFICIENT'; hrScore: string; note: string }

export function judgementBody(j: Judgement): { hrSufficiency: Judgement['hrSufficiency']; hrScore: number | null; note: string | null } {
  return { hrSufficiency: j.hrSufficiency, hrScore: j.hrSufficiency === 'SUFFICIENT' ? Number(j.hrScore) : null, note: j.note.trim() || null }
}

export function JudgementFields({ value, onChange }: { value: Judgement; onChange: (next: Judgement) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1">
        <Label htmlFor="judgement-sufficiency">HR’s judgement</Label>
        <Select value={value.hrSufficiency} onValueChange={(v) => onChange({ ...value, hrSufficiency: v === 'INSUFFICIENT' ? 'INSUFFICIENT' : 'SUFFICIENT' })}>
          <SelectTrigger id="judgement-sufficiency" aria-label="HR’s judgement"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="SUFFICIENT">Enough evidence to score</SelectItem>
            <SelectItem value="INSUFFICIENT">Not enough evidence</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {value.hrSufficiency === 'SUFFICIENT' && (
        <div className="space-y-1">
          <Label htmlFor="judgement-score">HR’s score</Label>
          <Select value={value.hrScore} onValueChange={(v) => onChange({ ...value, hrScore: v })}>
            <SelectTrigger id="judgement-score" aria-label="HR’s score"><SelectValue /></SelectTrigger>
            <SelectContent>{LEVEL_KEYS.map((key) => <SelectItem key={key} value={key}>{key} · {LEVEL_LABELS[key]}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="judgement-note">Note (optional)</Label>
        <Textarea id="judgement-note" rows={2} maxLength={1000} value={value.note} onChange={(e) => onChange({ ...value, note: e.target.value })} />
      </div>
    </div>
  )
}
