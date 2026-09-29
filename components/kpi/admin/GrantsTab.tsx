'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { GrantRow, GrantsResponse, KpiGrantRoleValue } from '@/lib/kpi/view-types'
import { errorMessage, kpiRequest } from '../kpi-api'

const ROLE_LABELS: Record<KpiGrantRoleValue, string> = { VERIFIER: 'KPI verifier', DEPARTMENT_SETTER: 'Department KPI setter' }

export function GrantsTab() {
  const [data, setData] = useState<GrantsResponse | null>(null)
  const [userId, setUserId] = useState('')
  const [role, setRole] = useState<KpiGrantRoleValue>('VERIFIER')
  const [removing, setRemoving] = useState<GrantRow | null>(null)

  const load = useCallback(async () => {
    try {
      setData(await kpiRequest<GrantsResponse>('/api/admin/kpi/grants'))
    } catch (e) {
      toast.error(errorMessage(e, 'Could not load roles'))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function add() {
    try {
      await kpiRequest('/api/admin/kpi/grants', { method: 'POST', body: { userId, role } })
      toast.success('Role granted')
      setUserId('')
      await load()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not grant the role'))
    }
  }

  async function remove() {
    const grant = removing
    setRemoving(null)
    if (!grant) return
    try {
      await kpiRequest('/api/admin/kpi/grants', { method: 'DELETE', body: { id: grant.id } })
      toast.success('Role removed')
      await load()
    } catch (e) {
      toast.error(errorMessage(e, 'Could not remove the role'))
    }
  }

  if (!data) return <p className="text-sm text-muted-foreground">Loading roles…</p>

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Anyone with the Execution role verifies KPIs automatically, and HR is always the backup. Partners and HR set department KPIs automatically. Use this to add others.
      </p>
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-2">
            <Label htmlFor="grant-person">Person</Label>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger id="grant-person" className="w-64" aria-label="Person"><SelectValue placeholder="Choose a person" /></SelectTrigger>
              <SelectContent>
                {data.people.map((person) => <SelectItem key={person.id} value={person.id}>{person.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="grant-role">Role</Label>
            <Select value={role} onValueChange={(value) => setRole(value as KpiGrantRoleValue)}>
              <SelectTrigger id="grant-role" className="w-56" aria-label="Role"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(ROLE_LABELS) as KpiGrantRoleValue[]).map((value) => <SelectItem key={value} value={value}>{ROLE_LABELS[value]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={add} disabled={!userId}>Grant role</Button>
        </CardContent>
      </Card>
      {data.grants.length === 0 ? (
        <p className="text-sm text-muted-foreground">No extra roles granted.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {data.grants.map((grant) => (
            <li key={grant.id} className="flex items-center justify-between gap-3 p-2 text-sm">
              <span>{grant.user.name} · {ROLE_LABELS[grant.role]}</span>
              <Button size="sm" variant="ghost" onClick={() => setRemoving(grant)}>Remove</Button>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        isOpen={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        title="Remove this role?"
        message={removing ? `${removing.user.name} will no longer be a ${ROLE_LABELS[removing.role].toLowerCase()}.` : ''}
        confirmText="Remove"
        variant="warning"
      />
    </div>
  )
}
