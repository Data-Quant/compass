'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { FormStatusValue, FormTableKind, FormTableRow, FormTableView } from '@/lib/weekly/view-types'
import { errorMessage, weeklyRequest } from '../weekly-api'

const STATUS_LABELS: Record<FormStatusValue, string> = {
  NOT_STARTED: 'Not started', DRAFT: 'Draft', SUBMITTED: 'Submitted', CLOSED_BY_OTHER: 'Done by another HR evaluator',
}
const SCORES = [1, 2, 3, 4] as const

interface FormTableProps { kind: FormTableKind; table: FormTableView; editable: boolean }

const isComplete = (row: FormTableRow, questionIds: readonly string[]) => questionIds.every((id) => row.ratings[id] !== null)
const totalOf = (row: FormTableRow) => {
  const scored = Object.values(row.ratings).filter((v): v is number => v !== null)
  return scored.length ? scored.reduce((a, b) => a + b, 0) : null
}

/** One row per person, a 1–4 picker per question, saved as HR goes. A submitted row re-submits on every change. */
export function FormTable({ kind, table, editable }: FormTableProps) {
  const [rows, setRows] = useState<FormTableRow[]>(table.rows)
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const questionIds = table.questions.map((q) => q.id)

  async function save(row: FormTableRow, submit: boolean): Promise<boolean> {
    setBusy((current) => new Set(current).add(row.evaluateeId))
    try {
      const result = await weeklyRequest<{ status: FormStatusValue }>('/api/admin/weekly/form-tables', {
        method: 'POST',
        body: {
          kind, evaluatorId: table.evaluator.id, relationshipType: table.relationshipType, evaluateeId: row.evaluateeId, submit,
          ratings: questionIds.map((questionId) => ({ questionId, ratingValue: row.ratings[questionId] })),
        },
      })
      setRows((current) => current.map((r) => (r.evaluateeId === row.evaluateeId ? { ...row, status: result.status } : r)))
      return true
    } catch (e) {
      toast.error(errorMessage(e, `Could not save ${row.name}`))
      return false
    } finally {
      setBusy((current) => {
        const next = new Set(current)
        next.delete(row.evaluateeId)
        return next
      })
    }
  }

  function score(row: FormTableRow, questionId: string, value: string) {
    const next = { ...row, ratings: { ...row.ratings, [questionId]: value ? Number(value) : null } }
    setRows((current) => current.map((r) => (r.evaluateeId === row.evaluateeId ? next : r)))
    void save(next, row.status === 'SUBMITTED')
  }

  const ready = rows.filter((r) => r.status !== 'SUBMITTED' && r.status !== 'CLOSED_BY_OTHER' && isComplete(r, questionIds))
  async function submitAll() {
    let done = 0
    for (const row of ready) if (await save(row, true)) done += 1
    toast.success(`${done} ${done === 1 ? 'row' : 'rows'} submitted`)
  }

  const submitted = rows.filter((r) => r.status === 'SUBMITTED' || r.status === 'CLOSED_BY_OTHER').length
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{submitted} of {rows.length} submitted</p>
        {editable && ready.length > 0 && <Button size="sm" onClick={() => void submitAll()}>Submit all complete rows ({ready.length})</Button>}
      </div>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-muted/50">
            <tr className="align-bottom">
              <th className="sticky left-0 z-10 min-w-44 bg-muted/50 p-2 text-left font-medium">Name of the assessee</th>
              <th className="min-w-32 p-2 text-left font-medium">Designation</th>
              <th className="min-w-32 p-2 text-left font-medium">Department</th>
              {table.questions.map((q) => (
                <th key={q.id} className="min-w-36 max-w-48 p-2 text-left text-xs font-medium" title={SCORES.map((s) => `${s}: ${q.ratingDescriptions[String(s) as '1'] ?? ''}`).join('\n')}>{q.text}</th>
              ))}
              <th className="p-2 text-right font-medium">Total</th>
              <th className="min-w-36 p-2 text-left font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const locked = !editable || row.status === 'CLOSED_BY_OTHER' || busy.has(row.evaluateeId)
              const name = table.relationshipType === 'DEPT' ? `${row.department ?? 'Unassigned'} department` : row.name
              return (
                <tr key={row.evaluateeId} className="border-t">
                  <td className="sticky left-0 z-10 bg-background p-2 font-medium">
                    {name}
                    {table.relationshipType === 'DEPT' && <span className="block text-xs font-normal text-muted-foreground">All {row.memberCount} people</span>}
                  </td>
                  <td className="p-2 text-muted-foreground">{table.relationshipType === 'DEPT' ? '' : row.designation ?? ''}</td>
                  <td className="p-2 text-muted-foreground">{row.department ?? ''}</td>
                  {table.questions.map((q) => (
                    <td key={q.id} className="p-1">
                      <select
                        aria-label={`${q.text} for ${name}`}
                        className="h-8 w-16 rounded border bg-background px-1 text-right disabled:opacity-60"
                        value={row.ratings[q.id] ?? ''}
                        disabled={locked}
                        onChange={(e) => score(row, q.id, e.target.value)}
                      >
                        {row.status !== 'SUBMITTED' && <option value="">–</option>}
                        {SCORES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </td>
                  ))}
                  <td className="p-2 text-right font-semibold tabular-nums">{totalOf(row) ?? '–'}</td>
                  <td className="p-2">
                    {row.status === 'SUBMITTED' || row.status === 'CLOSED_BY_OTHER' || !editable ? (
                      <Badge variant={row.status === 'SUBMITTED' ? 'default' : 'outline'}>{STATUS_LABELS[row.status]}</Badge>
                    ) : (
                      <Button size="sm" variant="outline" disabled={locked || !isComplete(row, questionIds)} onClick={() => void save(row, true)}>Submit</Button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
