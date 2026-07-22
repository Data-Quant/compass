'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { filterPaymentRows } from '@/lib/payroll/payments'

/**
 * Categories hidden from the grid to keep it narrow. Display-only: hidden
 * categories still count toward Paid and are still saved at their existing
 * values, so no amount is lost -- it simply is not shown or separately editable.
 */
const HIDDEN_CATEGORY_KEYS = new Set([
  'UTILITY_REIMBURSEMENT',
  'MEALS_REIMBURSEMENT',
  'EXPENSE_REIMBURSEMENT',
])

const CATEGORY_LABELS: Record<string, string> = {
  BASIC_SALARY: 'Basic',
  MEDICAL_ALLOWANCE: 'Medical',
  BONUS: 'Bonus',
  TRAVEL_REIMBURSEMENT: 'Travel',
  MOBILE_REIMBURSEMENT: 'Mobile',
  UTILITY_REIMBURSEMENT: 'Utility',
  MEALS_REIMBURSEMENT: 'Meals',
  EXPENSE_REIMBURSEMENT: 'Reimb.',
  ADVANCE_LOAN: 'Advance',
}

type Category = { componentKey: string; computed: number; paid: number }
type Row = {
  payrollName: string
  userId: string | null
  netSalary: number
  previousBalance: number
  categories: Category[]
  medicalTaxExemption: number
  totalDeductions: number
  paidTotal: number
  balance: number
  status: 'PAID' | 'PARTIAL' | 'PENDING'
}

const money = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 0 })

const STATUS_STYLE: Record<Row['status'], string> = {
  PAID: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  PARTIAL: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  PENDING: 'bg-muted text-muted-foreground',
}

export function PayrollPaymentsGrid({
  periodId,
  editable,
  onSaved,
}: {
  periodId: string
  editable: boolean
  onSaved?: () => void
}) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // paid overrides keyed by `${payrollName}|${componentKey}`
  const [edits, setEdits] = useState<Record<string, number>>({})
  const [query, setQuery] = useState('')

  // Display-only filter. Saving still walks every row, so edits on rows hidden
  // by the search are preserved and submitted.
  const visibleRows = useMemo(() => filterPaymentRows(rows, query), [rows, query])

  useEffect(() => {
    fetch(`/api/payroll/periods/${periodId}/payments`)
      .then((r) => r.json())
      .then((d) => setRows(d.rows || []))
      .catch(() => toast.error('Failed to load payments'))
      .finally(() => setLoading(false))
  }, [periodId])

  // Display-only. Saving and the Paid/Balance maths still walk every category.
  const keys = (rows[0]?.categories.map((c) => c.componentKey) ?? []).filter(
    (k) => !HIDDEN_CATEGORY_KEYS.has(k)
  )

  const paidFor = (row: Row, key: string) => {
    const k = `${row.payrollName}|${key}`
    if (k in edits) return edits[k]
    return row.categories.find((c) => c.componentKey === key)?.paid ?? 0
  }

  // Live-derived paid/balance so HR sees the effect as they type.
  // Live-derived so HR sees the effect as they type. Everything withheld — the
  // medical tax exemption and the deductions — scales with the fraction of the
  // earning line items actually paid, so Paid lands on the payslip's Net Salary
  // when nothing is held back, and on 0 when a salary is held.
  const derived = useMemo(() => {
    const out: Record<string, { netPaid: number; balance: number }> = {}
    for (const row of rows) {
      // Every category counts, including the ones hidden from the table.
      let totalComputed = 0
      let totalPaid = 0
      for (const c of row.categories) {
        const k = `${row.payrollName}|${c.componentKey}`
        totalComputed += c.computed
        totalPaid += k in edits ? edits[k] : c.paid
      }
      const ratio = totalComputed > 0 ? totalPaid / totalComputed : 0
      const netPaid = ratio * row.netSalary
      out[row.payrollName] = {
        netPaid,
        balance: row.previousBalance + row.netSalary - netPaid,
      }
    }
    return out
  }, [rows, edits])

  const setCell = (payrollName: string, key: string, value: string) => {
    const n = Number(value)
    setEdits((prev) => ({ ...prev, [`${payrollName}|${key}`]: Number.isFinite(n) ? n : 0 }))
  }

  const save = async () => {
    setSaving(true)
    try {
      const marks = rows.map((row) => ({
        payrollName: row.payrollName,
        userId: row.userId,
        amounts: Object.fromEntries(
          row.categories.map((c) => [c.componentKey, paidFor(row, c.componentKey)])
        ),
      }))
      const res = await fetch(`/api/payroll/periods/${periodId}/payments`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marks }),
      })
      const data = await res.json()
      if (data.error) {
        toast.error(data.error)
        return
      }
      toast.success('Payments saved')
      setEdits({})
      const fresh = await fetch(`/api/payroll/periods/${periodId}/payments`).then((r) => r.json())
      setRows(fresh.rows || [])
      onSaved?.()
    } catch {
      toast.error('Failed to save payments')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search employee…"
          aria-label="Search employees"
          className="h-9 pl-9"
        />
      </div>

      <div className="overflow-x-auto rounded-card border border-border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="sticky left-0 bg-muted/50">Employee</TableHead>
              {keys.map((k) => (
                <TableHead key={k} className="text-right whitespace-nowrap">
                  {CATEGORY_LABELS[k] ?? k}
                </TableHead>
              ))}
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.length === 0 && query.trim() !== '' && (
              <TableRow>
                <TableCell colSpan={keys.length + 4} className="text-center text-sm text-muted-foreground py-8">
                  No employee matches “{query.trim()}”.
                </TableCell>
              </TableRow>
            )}
            {visibleRows.map((row) => {
              const d = derived[row.payrollName]
              const status: Row['status'] =
                d.balance <= 0 ? 'PAID' : d.netPaid <= 0 ? 'PENDING' : 'PARTIAL'
              return (
                <TableRow key={row.payrollName}>
                  <TableCell className="font-medium text-sm sticky left-0 bg-background">
                    {row.payrollName}
                  </TableCell>
                  {row.categories
                    .filter((c) => !HIDDEN_CATEGORY_KEYS.has(c.componentKey))
                    .map((c) => (
                      <TableCell key={c.componentKey} className="text-right p-1">
                        <Input
                          type="number"
                          value={paidFor(row, c.componentKey)}
                          disabled={!editable}
                          onChange={(e) => setCell(row.payrollName, c.componentKey, e.target.value)}
                          className="h-8 w-24 text-right tabular-nums ml-auto"
                        />
                      </TableCell>
                    ))}
                  <TableCell className="text-right tabular-nums text-sm">
                    {money(d.netPaid)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm font-semibold">
                    {money(d.balance)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={cn('text-[10px]', STATUS_STYLE[status])}>
                      {status}
                    </Badge>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {editable && (
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
            Save Payments
          </Button>
        </div>
      )}
    </div>
  )
}
