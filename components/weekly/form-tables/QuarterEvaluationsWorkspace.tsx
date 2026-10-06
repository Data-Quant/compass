'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatKarachiDate } from '@/lib/weekly/format'
import type { FormTableKind, FormTablesResponse, TableRelationshipTypeValue } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'
import { FormTable } from './FormTable'

const RELATIONSHIP_LABELS: Record<TableRelationshipTypeValue, string> = {
  C_LEVEL: 'C-Level', DEPT: 'Department', HR: 'HR', TEAM_LEAD: 'As their lead', DIRECT_REPORT: 'As a member of their team',
  PEER: 'As a peer', CROSS_DEPARTMENT: 'Cross-department', SELF: 'Self',
}

function TablesPanel({ kind }: { kind: FormTableKind }) {
  const [data, setData] = useState<FormTablesResponse | null>(null)
  const load = useCallback(async () => {
    try {
      setData(await weeklyRequest<FormTablesResponse>(`/api/admin/weekly/form-tables?kind=${kind}`))
    } catch (e) {
      toast.error(errorMessage(e, 'Could not load the evaluations'))
    }
  }, [kind])
  useEffect(() => {
    void load()
  }, [load])

  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (!data.cycle) return <p className="text-sm text-muted-foreground">No quarter is running on weekly evaluations.</p>
  if (data.tables.length === 0) {
    return <p className="text-sm text-muted-foreground">{kind === 'HR' ? 'You have no HR evaluations this quarter.' : 'No partner has evaluations mapped this quarter.'}</p>
  }
  return (
    <div className="space-y-6">
      {data.locked && <p className="text-sm text-muted-foreground">This quarter is locked, so these evaluations can no longer change.</p>}
      {!data.locked && !data.open && data.opensAt && <p className="text-sm text-muted-foreground">These open on {formatKarachiDate(data.opensAt)}. Until then you can look but not score.</p>}
      {data.tables.map((table) => (
        <Card key={`${table.evaluator.id}-${table.relationshipType}`}>
          <CardContent className="space-y-3 p-4">
            <h2 className="font-semibold">
              {kind === 'HR' ? 'HR evaluation' : `${table.evaluator.name} · ${RELATIONSHIP_LABELS[table.relationshipType]}`}
            </h2>
            <FormTable kind={kind} table={table} editable={data.open && !data.locked} />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

/** HR's end-of-quarter scoring: its own HR evaluations, and the partners' evaluations it fills in on their behalf. */
export function QuarterEvaluationsWorkspace() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 sm:p-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Quarter-end evaluations</h1>
        <p className="mt-1 text-muted-foreground">Score everyone in one table, 1 to 4 per question. Rows save as you go; submit a row when it is complete.</p>
      </div>
      <Tabs defaultValue="hr">
        <TabsList>
          <TabsTrigger value="hr">HR evaluations</TabsTrigger>
          <TabsTrigger value="partners">Partner evaluations</TabsTrigger>
        </TabsList>
        <TabsContent value="hr" className="pt-4"><TablesPanel kind="HR" /></TabsContent>
        <TabsContent value="partners" className="pt-4">
          <p className="mb-4 text-sm text-muted-foreground">Filled in by HR on the partners’ behalf. The partners do not see these on their own accounts.</p>
          <TablesPanel kind="PARTNER" />
        </TabsContent>
      </Tabs>
    </div>
  )
}
