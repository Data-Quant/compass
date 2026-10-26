'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, History, Search } from 'lucide-react'
import { toast } from 'sonner'
import type { QuarterMappingRow, QuarterMappingsView } from '@/lib/quarter-mappings'
import { RELATIONSHIP_TYPE_LABELS, type RelationshipType } from '@/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const SOURCE_LABELS: Record<QuarterMappingRow['source'], string> = {
  PERMANENT_MAPPING: 'Org chart',
  PRE_EVALUATION_PEER: 'Peer chosen for the quarter',
  PRE_EVALUATION_CROSS_DEPARTMENT: 'Cross-department chosen for the quarter',
  PERIOD_OVERRIDE: 'Changed for this quarter',
}

const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const csvCell = (value: string) => (/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)

function downloadCsv(view: QuarterMappingsView, rows: QuarterMappingRow[]) {
  const header = ['Quarter', 'Evaluatee', 'Evaluatee department', 'Evaluator role', 'Evaluator', 'Evaluator department', 'Source']
  const lines = rows.map((r) => [
    view.quarter?.name ?? '', r.evaluatee.name, r.evaluatee.department ?? '', RELATIONSHIP_TYPE_LABELS[r.relationshipType], r.evaluator.name, r.evaluator.department ?? '', SOURCE_LABELS[r.source],
  ])
  const csv = [header, ...lines].map((line) => line.map(csvCell).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `mappings-${(view.quarter?.name ?? 'quarter').replace(/\s+/g, '-').toLowerCase()}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * Every evaluator → evaluatee pair a quarter used, for auditing. Read-only: a closed or locked quarter shows the
 * mappings saved then; any other quarter shows today's, which can still change.
 */
export function QuarterMappingsHistory() {
  const [periodId, setPeriodId] = useState<string | undefined>(undefined)
  const [view, setView] = useState<QuarterMappingsView | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [type, setType] = useState<RelationshipType | 'all'>('all')

  const load = useCallback(async (id?: string) => {
    setLoading(true)
    try {
      const response = await fetch(`/api/admin/quarter-mappings${id ? `?periodId=${encodeURIComponent(id)}` : ''}`, { cache: 'no-store' })
      if (!response.ok) throw new Error('Failed to load quarter mappings')
      setView((await response.json()) as QuarterMappingsView)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load quarter mappings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load(periodId) }, [load, periodId])

  const types = useMemo(() => [...new Set((view?.rows ?? []).map((r) => r.relationshipType))].sort(), [view])
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return (view?.rows ?? []).filter((r) =>
      (type === 'all' || r.relationshipType === type) &&
      (!term || r.evaluatee.name.toLowerCase().includes(term) || r.evaluator.name.toLowerCase().includes(term)))
  }, [view, search, type])

  return (
    <Card className="border-white/10 bg-[#111318]">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><History className="h-5 w-5" />Quarter mappings</CardTitle>
            <CardDescription className="mt-1 max-w-3xl">
              Who evaluated whom in a quarter, and where each pair came from. A quarter is saved when its round closes (or it is locked); until then this shows the mappings it would use today.
            </CardDescription>
          </div>
          {view?.quarter && (
            view.state.kind === 'saved'
              ? <Badge className="bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/15">Saved{view.state.savedAt ? ` ${formatDate(view.state.savedAt)}` : ''} · fixed</Badge>
              : <Badge variant="outline" className="border-amber-500/40 text-amber-400">Live · can still change</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <div className="lg:w-[240px]">
            <Label>Quarter</Label>
            <Select value={view?.quarter?.id ?? ''} onValueChange={(value) => setPeriodId(value)}>
              <SelectTrigger className="mt-2" aria-label="Quarter"><SelectValue placeholder="Choose a quarter" /></SelectTrigger>
              <SelectContent>{(view?.quarters ?? []).map((q) => <SelectItem key={q.id} value={q.id}>{q.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="lg:w-[240px]">
            <Label>Relationship</Label>
            <Select value={type} onValueChange={(value) => setType(value as RelationshipType | 'all')}>
              <SelectTrigger className="mt-2" aria-label="Relationship"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All relationships</SelectItem>
                {types.map((t) => <SelectItem key={t} value={t}>{RELATIONSHIP_TYPE_LABELS[t]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1">
            <Label>Search</Label>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Evaluator or evaluatee name" className="pl-9" />
            </div>
          </div>
          <Button variant="outline" disabled={!view || rows.length === 0} onClick={() => view && downloadCsv(view, rows)}><Download className="h-4 w-4" />Export CSV</Button>
        </div>

        <p className="text-sm text-muted-foreground">
          {loading ? 'Loading…' : `${rows.length} of ${view?.rows.length ?? 0} pairs${view?.quarter ? ` in ${view.quarter.name}` : ''}`}
        </p>
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-left text-xs uppercase tracking-[0.12em] text-muted-foreground">
              <tr>
                <th className="p-3 font-medium">Evaluatee</th>
                <th className="p-3 font-medium">Evaluator role</th>
                <th className="p-3 font-medium">Evaluator</th>
                <th className="p-3 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.evaluator.id}-${r.evaluatee.id}-${r.relationshipType}`} className="border-t border-white/10">
                  <td className="p-3"><div className="font-medium">{r.evaluatee.name}</div><div className="text-xs text-muted-foreground">{r.evaluatee.department ?? ''}</div></td>
                  <td className="p-3">{RELATIONSHIP_TYPE_LABELS[r.relationshipType]}</td>
                  <td className="p-3"><div>{r.evaluator.name}</div><div className="text-xs text-muted-foreground">{r.evaluator.department ?? ''}</div></td>
                  <td className="p-3 text-muted-foreground">{SOURCE_LABELS[r.source]}</td>
                </tr>
              ))}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No mappings match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
