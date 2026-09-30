'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PERSPECTIVE_LABELS } from '@/lib/weekly/perspectives'
import type { CalibrationItemView, CalibrationItemsResponse } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'
import { CalibrationItemDialog } from './CalibrationItemDialog'

const judgementLabel = (item: CalibrationItemView) => (item.hrSufficiency === 'INSUFFICIENT' ? 'Not enough evidence' : String(item.hrScore))

export function CalibrationSetCard({ data, onChanged }: { data: CalibrationItemsResponse; onChanged: () => Promise<void> }) {
  const [editing, setEditing] = useState<CalibrationItemView | 'new' | null>(null)
  const [busy, setBusy] = useState(false)
  const active = data.items.filter((i) => !i.archived)
  const archived = data.items.filter((i) => i.archived)

  async function setArchived(item: CalibrationItemView, archive: boolean) {
    setBusy(true)
    try {
      await weeklyRequest(`/api/admin/weekly/calibration/items/${item.id}`, { method: 'PATCH', body: { op: archive ? 'archive' : 'restore' } })
      toast.success(archive ? 'Item archived' : 'Item restored')
      await onChanged()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not change the item'))
    } finally {
      setBusy(false)
    }
  }

  const table = (items: CalibrationItemView[], offset: number) => (
    <table className="w-full text-sm">
      <thead><tr className="text-left text-muted-foreground"><th className="py-1">Topic</th><th>Situation</th><th>HR’s score</th><th /></tr></thead>
      <tbody>
        {items.map((item, index) => (
          <tr key={item.id} className="border-t align-top">
            <td className="py-1">{item.topic}<p className="text-xs text-muted-foreground">{PERSPECTIVE_LABELS[item.perspective]}{item.fromAnswer ? ' · from a real answer' : ''}</p></td>
            <td className="max-w-md"><p className="line-clamp-2">{item.situation}</p></td>
            <td>{judgementLabel(item)}</td>
            <td className="whitespace-nowrap text-right">
              <Button size="sm" variant="ghost" aria-label={`Edit calibration item ${offset + index + 1}`} onClick={() => setEditing(item)}>Edit</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void setArchived(item, !item.archived)}>{item.archived ? 'Restore' : 'Archive'}</Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Calibration set</h2>
            <p className="text-sm text-muted-foreground">{data.active} of {data.needed} active items needed before a model can pass calibration.</p>
          </div>
          <Button size="sm" disabled={data.topics.length === 0} onClick={() => setEditing('new')}>Add an item</Button>
        </div>
        {active.length === 0 ? <p className="text-sm text-muted-foreground">No items yet. Add them by hand, or with “Add to calibration set” on a review card.</p> : table(active, 0)}
        {archived.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer">{archived.length} archived items (left out of runs)</summary>
            <div className="mt-2">{table(archived, active.length)}</div>
          </details>
        )}
      </CardContent>
      {editing && (
        <CalibrationItemDialog
          item={editing === 'new' ? null : editing}
          topics={data.topics}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await onChanged()
          }}
        />
      )}
    </Card>
  )
}
