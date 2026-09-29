'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { currentMonthKey, formatKarachiDate, karachiDateInputValue, monthLabel } from '@/lib/kpi/format'
import type { AdminMonthRow } from '@/lib/kpi/view-types'
import { errorMessage, kpiRequest } from '../kpi-api'

const FIELDS = [
  ['goalsLockAt', 'KPIs lock'],
  ['claimsDueAt', 'Claims due'],
  ['verifyDueAt', 'Verification due'],
  ['responseDueAt', 'Replies and appeals due'],
  ['targetFinalAt', 'Month final'],
] as const
type DeadlineField = (typeof FIELDS)[number][0]
type DeadlineDates = Record<DeadlineField, string>

export function MonthsTab() {
  const [months, setMonths] = useState<AdminMonthRow[] | null>(null)
  const [newMonth, setNewMonth] = useState(() => currentMonthKey())
  const [editing, setEditing] = useState<AdminMonthRow | null>(null)

  const load = useCallback(async () => {
    try {
      setMonths((await kpiRequest<{ months: AdminMonthRow[] }>('/api/admin/kpi/months')).months)
    } catch (e) {
      toast.error(errorMessage(e, 'Could not load months'))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function addMonth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      await kpiRequest('/api/admin/kpi/months', { method: 'POST', body: { monthKey: newMonth } })
      toast.success(`${monthLabel(newMonth)} added with default dates`)
      await load()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not add the month'))
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-2 p-4">
          <form onSubmit={addMonth} className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor="new-month">Add a month</Label>
              <Input id="new-month" type="month" value={newMonth} onChange={(e) => setNewMonth(e.target.value)} required />
            </div>
            <Button type="submit">Add month</Button>
          </form>
          <p className="text-xs text-muted-foreground">Dates default to working days (Monday to Friday) and can be edited afterwards.</p>
        </CardContent>
      </Card>
      {months === null ? (
        <p className="text-sm text-muted-foreground">Loading months…</p>
      ) : months.length === 0 ? (
        <p className="text-sm text-muted-foreground">No months yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left">
                <th className="p-2">Month</th>
                {FIELDS.map(([, label]) => <th key={label} className="p-2">{label}</th>)}
                <th className="p-2">KPIs</th>
                <th className="p-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {months.map((month) => (
                <tr key={month.id} className="border-b last:border-0">
                  <td className="p-2 font-medium">{monthLabel(month.monthKey)}</td>
                  {FIELDS.map(([field]) => <td key={field} className="p-2">{formatKarachiDate(month[field])}</td>)}
                  <td className="p-2">{month.kpiCount}</td>
                  <td className="p-2 text-right">
                    <Button size="sm" variant="outline" onClick={() => setEditing(month)}>Edit dates</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <MonthDatesDialog
          month={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await load()
          }}
        />
      )}
    </div>
  )
}

function MonthDatesDialog({ month, onClose, onSaved }: { month: AdminMonthRow; onClose: () => void; onSaved: () => Promise<void> }) {
  const [dates, setDates] = useState<DeadlineDates>(
    () => Object.fromEntries(FIELDS.map(([field]) => [field, karachiDateInputValue(month[field])])) as DeadlineDates,
  )
  const [saving, setSaving] = useState(false)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      await kpiRequest(`/api/admin/kpi/months/${month.id}`, { method: 'PATCH', body: dates })
      toast.success('Dates saved')
      await onSaved()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save the dates'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={`${monthLabel(month.monthKey)} dates`}>
      <form onSubmit={save} className="space-y-3">
        {FIELDS.map(([field, label]) => (
          <div key={field} className="space-y-1">
            <Label htmlFor={`date-${field}`}>{label}</Label>
            <Input id={`date-${field}`} type="date" value={dates[field]} onChange={(e) => setDates({ ...dates, [field]: e.target.value })} required />
          </div>
        ))}
        <p className="text-xs text-muted-foreground">Each deadline is the end of that day, Karachi time.</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save dates'}</Button>
        </div>
      </form>
    </Modal>
  )
}
