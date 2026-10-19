'use client'

import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { ConsoleGrantView } from '@/lib/security-checks/service/grants'
import type { SelfReviewReportItem } from '@/lib/security-checks/service/reports'
import { formatDateTime } from '../format'
import { errorMessage, scRequest } from '../sc-api'
import { AuditLogCard } from './AuditLogCard'
import { useScMe } from './use-sc-me'

interface Settings {
  retentionEnabled: boolean
  evidenceRetentionMonths: number
  attestationRetentionMonths: number
  auditRetentionMonths: number
  retentionFirstRunAt: string | null
}

function SelfReviewReportCard() {
  const lastMonth = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString().slice(0, 7)
  const [month, setMonth] = useState(lastMonth)
  const [items, setItems] = useState<SelfReviewReportItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    scRequest<{ items: SelfReviewReportItem[] }>(`/api/security-checks/console/self-review-report?month=${month}`)
      .then((report) => { setItems(report.items); setError(null) })
      .catch((e: unknown) => setError(errorMessage(e, 'Could not load the report')))
  }, [month])
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Monthly self-review report</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <Input type="month" className="max-w-xs" value={month} onChange={(event) => setMonth(event.target.value)} />
        {error && <p className="text-sm text-destructive">{error}</p>}
        {items && items.length === 0 && <p className="text-sm text-muted-foreground">No self-reviewed verdicts, extensions or exemptions this month.</p>}
        {items?.map((item, index) => (
          <div key={`${item.at}-${index}`} className="text-sm">
            <p className="font-medium">{item.action} — {item.actorName}{item.employeeName ? ` on ${item.employeeName}’s task` : ''}</p>
            <p className="text-xs text-muted-foreground">{formatDateTime(item.at)} · {JSON.stringify(item.details)}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function GrantsCard() {
  const [grants, setGrants] = useState<ConsoleGrantView[]>([])
  const [people, setPeople] = useState<Array<{ id: string; name: string; department: string | null }>>([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(() => {
    Promise.all([
      scRequest<ConsoleGrantView[]>('/api/security-checks/console/grants'),
      scRequest<{ people: Array<{ id: string; name: string; department: string | null }> }>('/api/security-checks/console/directory'),
    ])
      .then(([list, directory]) => { setGrants(list); setPeople(directory.people) })
      .catch((e: unknown) => setError(errorMessage(e, 'Could not load Console Admins')))
  }, [])
  useEffect(load, [load])
  const change = (method: 'POST' | 'DELETE', userId: string) =>
    scRequest<ConsoleGrantView[]>('/api/security-checks/console/grants', { method, body: { userId } })
      .then((list) => { setGrants(list); setQuery(''); setError(null) })
      .catch((e: unknown) => setError(errorMessage(e, 'Could not update access')))
  const granted = new Set(grants.map((grant) => grant.userId))
  const matches = query.trim().length < 2 ? [] : people.filter((person) => !granted.has(person.id) && person.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 6)
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Console Admins (read-only access)</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">Dashboards, submissions and evidence viewing (every view logged), and the self-review report. No reviewing, campaign changes, downloads, CSV or audit log. Everyone with the HR role has this access automatically; grant it here to anyone else.</p>
        {grants.map((grant) => (
          <div key={grant.userId} className="flex items-center justify-between text-sm">
            <span>{grant.name} <span className="text-muted-foreground">{grant.department ?? ''}</span></span>
            <Button size="sm" variant="ghost" aria-label={`Revoke ${grant.name}`} onClick={() => void change('DELETE', grant.userId)}><X className="h-4 w-4" /></Button>
          </div>
        ))}
        <div className="relative max-w-sm">
          <Input placeholder="Grant access to…" value={query} onChange={(event) => setQuery(event.target.value)} />
          {matches.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-popover shadow">
              {matches.map((person) => (
                <button key={person.id} type="button" className="block w-full px-3 py-1.5 text-left text-sm hover:bg-muted" onClick={() => void change('POST', person.id)}>
                  {person.name} <span className="text-muted-foreground">{person.department ?? ''}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}

function RetentionCard() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    scRequest<Settings>('/api/security-checks/console/settings').then(setSettings).catch((e: unknown) => setError(errorMessage(e, 'Could not load settings')))
  }, [])
  const save = (patch: Partial<Settings>) =>
    scRequest<Settings>('/api/security-checks/console/settings', { method: 'PATCH', body: patch })
      .then((next) => { setSettings(next); setError(null) })
      .catch((e: unknown) => setError(errorMessage(e, 'Could not save settings')))
  if (!settings) return error ? <p className="text-sm text-destructive">{error}</p> : null
  const months = (key: 'evidenceRetentionMonths' | 'attestationRetentionMonths' | 'auditRetentionMonths', label: string) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input type="number" min={1} className="w-28" defaultValue={settings[key]} onBlur={(event) => { const value = Number(event.target.value); if (value !== settings[key]) void save({ [key]: value }) }} />
    </div>
  )
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">Retention</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">Values are pending leadership approval. While off, nothing is deleted; on first enablement the job works through the accumulated backlog.</p>
        <div className="flex items-center gap-2">
          <Switch id="retention" checked={settings.retentionEnabled} onCheckedChange={(checked) => void save({ retentionEnabled: checked })} />
          <Label htmlFor="retention">Retention job enabled</Label>
        </div>
        <div className="flex flex-wrap gap-4">
          {months('evidenceRetentionMonths', 'Evidence (months after cycle close)')}
          {months('attestationRetentionMonths', 'Attestation records (months)')}
          {months('auditRetentionMonths', 'Audit log (months)')}
        </div>
        {settings.retentionFirstRunAt && <p className="text-xs text-muted-foreground">First run {formatDateTime(settings.retentionFirstRunAt)}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  )
}

export function AdminPanel() {
  const me = useScMe()
  if (!me) return <LoadingScreen message="Loading..." />
  const securityAdmin = Boolean(me.capabilities?.auditLog)
  if (!me.capabilities?.console) return <p className="p-6 text-sm text-muted-foreground">You do not have access to the Security Console.</p>
  return (
    <div className="space-y-6">
      <SelfReviewReportCard />
      {securityAdmin && (
        <>
          <GrantsCard />
          <RetentionCard />
          <AuditLogCard />
        </>
      )}
    </div>
  )
}
