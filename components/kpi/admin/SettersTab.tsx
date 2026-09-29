'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { PersonRef, SetterAssignmentRow, SettersResponse } from '@/lib/kpi/view-types'
import { errorMessage, kpiRequest } from '../kpi-api'

export function SettersTab() {
  const [data, setData] = useState<SettersResponse | null>(null)
  const [assigning, setAssigning] = useState<PersonRef | null>(null)
  const [removing, setRemoving] = useState<SetterAssignmentRow | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await kpiRequest<SettersResponse>('/api/admin/kpi/setters'))
    } catch (e) {
      toast.error(errorMessage(e, 'Could not load setters'))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (!data) return <p className="text-sm text-muted-foreground">Loading setters…</p>

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-3 p-4">
          <h3 className="font-semibold">People without a setter ({data.membersWithoutSetter.length})</h3>
          <p className="text-sm text-muted-foreground">These people are in the scheme but nobody sets their team KPIs.</p>
          {data.membersWithoutSetter.length === 0 ? (
            <p className="text-sm">Everyone has a setter.</p>
          ) : (
            <ul className="divide-y rounded-md border">
              {data.membersWithoutSetter.map((person) => (
                <li key={person.id} className="flex items-center justify-between gap-3 p-2 text-sm">
                  <span>{person.name}{person.position ? ` · ${person.position}` : ''}</span>
                  <Button size="sm" variant="outline" aria-label={`Assign setter for ${person.name}`} onClick={() => setAssigning(person)}>Assign setter</Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <section className="space-y-3">
        <h3 className="font-semibold">HR-assigned setters</h3>
        {data.assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet. By default each person’s title-qualified lead sets their KPIs.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left">
                  <th className="p-2">Person</th><th className="p-2">Setter</th><th className="p-2">Reason</th><th className="p-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {data.assignments.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="p-2">{row.employee.name}</td>
                    <td className="p-2">{row.setter.name}</td>
                    <td className="p-2">{row.reason}</td>
                    <td className="p-2 text-right"><Button size="sm" variant="ghost" onClick={() => setRemoving(row)}>Remove</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {assigning && (
        <ReasonDialog
          title={`Setter for ${assigning.name}`}
          people={data.people.filter((person) => person.id !== assigning.id)}
          submitLabel="Assign"
          onClose={() => setAssigning(null)}
          onSubmit={async (reason, setterId) => {
            await kpiRequest('/api/admin/kpi/setters', { method: 'POST', body: { employeeId: assigning.id, setterId, reason } })
            toast.success('Setter assigned')
            setAssigning(null)
            await load()
          }}
        />
      )}
      {removing && (
        <ReasonDialog
          title={`Remove ${removing.setter.name} as setter for ${removing.employee.name}`}
          submitLabel="Remove"
          onClose={() => setRemoving(null)}
          onSubmit={async (reason) => {
            await kpiRequest('/api/admin/kpi/setters', { method: 'DELETE', body: { id: removing.id, reason } })
            toast.success('Setter removed')
            setRemoving(null)
            await load()
          }}
        />
      )}
    </div>
  )
}

interface ReasonDialogProps {
  title: string
  people?: PersonRef[]
  submitLabel: string
  onClose: () => void
  onSubmit: (reason: string, setterId: string) => Promise<void>
}

function ReasonDialog({ title, people, submitLabel, onClose, onSubmit }: ReasonDialogProps) {
  const [setterId, setSetterId] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      await onSubmit(reason.trim(), setterId)
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen onClose={onClose} title={title}>
      <form onSubmit={submit} className="space-y-4">
        {people && (
          <div className="space-y-2">
            <Label htmlFor="setter-select">Setter</Label>
            <Select value={setterId} onValueChange={setSetterId}>
              <SelectTrigger id="setter-select" aria-label="Setter"><SelectValue placeholder="Choose a person" /></SelectTrigger>
              <SelectContent>
                {people.map((person) => <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="setter-reason">Reason</Label>
          <Textarea id="setter-reason" value={reason} onChange={(e) => setReason(e.target.value)} required minLength={3} maxLength={500} />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving || (people !== undefined && !setterId)}>{saving ? 'Saving…' : submitLabel}</Button>
        </div>
      </form>
    </Modal>
  )
}
