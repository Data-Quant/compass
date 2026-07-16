'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Trash2, Eye, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ALL_TEAMS, TEAM_LABELS, expandGroup } from '@/lib/handbook/teams'
import { matchGroup } from '@/lib/handbook/coverage'
import { HandbookMarkdown } from '@/components/handbook/HandbookMarkdown'

export type EditableVariant = {
  id: string
  bodyMarkdown: string
  audiences: string[]
}

export function VariantEditor({
  variant,
  onSaved,
  onDeleted,
}: {
  variant: EditableVariant
  onSaved: () => void
  onDeleted: () => void
}) {
  const [body, setBody] = useState(variant.bodyMarkdown)
  const [audiences, setAudiences] = useState<string[]>(variant.audiences)
  const [preview, setPreview] = useState(false)
  const [saving, setSaving] = useState(false)

  const group = matchGroup(audiences)

  const toggleTeam = (team: string) => {
    setAudiences((prev) => (prev.includes(team) ? prev.filter((t) => t !== team) : [...prev, team]))
  }

  const save = async () => {
    if (!audiences.length) {
      toast.error('Select at least one team')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/handbook/variants/${variant.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bodyMarkdown: body, audiences }),
      })
      const data = await res.json()
      if (data.error) {
        toast.error(data.error)
        return
      }
      toast.success('Variant saved')
      onSaved()
    } catch {
      toast.error('Failed to save variant')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!confirm('Delete this variant? The teams it covers will show as gaps.')) return
    try {
      const res = await fetch(`/api/admin/handbook/variants/${variant.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.error) {
        toast.error(data.error)
        return
      }
      toast.success('Variant deleted')
      onDeleted()
    } catch {
      toast.error('Failed to delete variant')
    }
  }

  return (
    <Card className="mb-6">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Label className="mb-0">Audience</Label>
            {group && (
              <Badge variant="secondary">
                {group === 'EVERYONE' ? 'Everyone' : 'Plutus21 Internal Team'}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPreview((p) => !p)}>
              {preview ? <Pencil className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              <span className="ml-1.5">{preview ? 'Edit' : 'Preview'}</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={remove}>
              <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
            </Button>
          </div>
        </div>

        {/* Group expansions write the underlying teams -- the groups are never stored. */}
        <div className="flex flex-wrap gap-2 mb-3">
          <Button variant="outline" size="sm" onClick={() => setAudiences(expandGroup('EVERYONE'))}>
            Everyone
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAudiences(expandGroup('PLUTUS21_INTERNAL'))}
          >
            Plutus21 Internal
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 mb-5">
          {ALL_TEAMS.map((team) => {
            const on = audiences.includes(team)
            return (
              <button
                key={team}
                type="button"
                onClick={() => toggleTeam(team)}
                className={cn(
                  'rounded-badge border px-3 py-1 text-xs transition-colors',
                  on
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-muted'
                )}
              >
                {TEAM_LABELS[team]}
              </button>
            )
          })}
        </div>

        <Label htmlFor={`body-${variant.id}`} className="mb-1">
          Body (Markdown)
        </Label>
        {preview ? (
          <div className="rounded-lg border border-border p-4 min-h-[300px]">
            <HandbookMarkdown source={body} />
          </div>
        ) : (
          <Textarea
            id={`body-${variant.id}`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="min-h-[300px] font-mono text-xs"
          />
        )}

        <div className="mt-4 flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save variant'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
