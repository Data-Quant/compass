'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  PAYABLE_EARNING_LABELS,
  distributeNetPaidAcrossCategories,
  filterPaymentRows,
  paymentStatus,
} from '@/lib/payroll/payments'

/**
 * Every payable earning is shown, so this grid reconciles with the Input & Review
 * earnings table column for column.
 *
 * Reimbursements used to be hidden here to keep the grid narrow, on the reasoning
 * that hidden categories were still saved at their existing values. That stopped
 * being true once an unrecorded category correctly defaulted to zero rather than to
 * its computed amount: saving then wrote zero for a column nobody could see, and
 * July alone carries 4.8m of reimbursements. A column holding real money has to be
 * visible on the tab where it is marked as paid.
 */

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
  // One net Paid override per employee, keyed by payrollName. The earning columns
  // are read-only, so there is a single editable number per row.
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

  const keys = rows[0]?.categories.map((c) => c.componentKey) ?? []

  /** The net amount paid: the live edit if there is one, else what is recorded. */
  const paidNetFor = (row: Row) =>
    row.payrollName in edits ? edits[row.payrollName] : row.paidTotal

  // Live-derived so HR sees the effect as they type.
  const derived = useMemo(() => {
    const out: Record<string, { paidNet: number; balance: number; status: Row['status'] }> = {}
    for (const row of rows) {
      const paidNet = row.payrollName in edits ? edits[row.payrollName] : row.paidTotal
      out[row.payrollName] = {
        paidNet,
        // Carries what earlier periods left owed, so the tab agrees with the
        // balance the engine stores and the payslip prints.
        balance: row.previousBalance + row.netSalary - paidNet,
        // The same shared rule as everywhere else, applied in net terms: what is
        // owed for this period against what was actually disbursed.
        //
        // Compared at whole rupees, the precision the grid displays. Net salary
        // carries fractions, so typing the figure shown -- 709,807 against a true
        // 709,807.43 -- would otherwise read as PARTIAL against a balance rendered
        // as 0, which looks broken to the person who just paid in full.
        status: paymentStatus([
          { computed: Math.round(row.netSalary), paid: Math.round(paidNet) },
        ]),
      }
    }
    return out
  }, [rows, edits])

  const setPaid = (payrollName: string, value: string) => {
    const n = Number(value)
    setEdits((prev) => ({ ...prev, [payrollName]: Number.isFinite(n) ? n : 0 }))
  }

  /**
   * Set Paid to the full net amount for everyone currently listed.
   *
   * Staged like any other edit, so nothing is recorded until Save, and only rows
   * matching the current search are touched.
   */
  const markAllPaidInFull = () => {
    setEdits((prev) => {
      const next = { ...prev }
      for (const row of visibleRows) next[row.payrollName] = row.netSalary
      return next
    })
  }

  const save = async () => {
    setSaving(true)
    try {
      // The grid captures one net figure, but PayrollPayment is keyed per category
      // and the engine reads it that way, so the amount is spread proportionally.
      // computeNetPaid inverts the split exactly, so what is typed is what reloads.
      const marks = rows.map((row) => {
        const spread = distributeNetPaidAcrossCategories(
          row.categories,
          row.netSalary,
          paidNetFor(row)
        )
        return {
          payrollName: row.payrollName,
          userId: row.userId,
          amounts: Object.fromEntries(
            row.categories.map((c, i) => [c.componentKey, spread[i].paid])
          ),
        }
      })
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
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search employee…"
            aria-label="Search employees"
            className="h-9 pl-9"
          />
        </div>
        {editable && (
          <Button variant="outline" size="sm" onClick={markAllPaidInFull}>
            Mark all paid in full
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-card border border-border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="sticky left-0 bg-muted/50">Employee</TableHead>
              {keys.map((k) => (
                <TableHead key={k} className="text-right whitespace-nowrap">
                  {PAYABLE_EARNING_LABELS[k as keyof typeof PAYABLE_EARNING_LABELS] ?? k}
                </TableHead>
              ))}
              <TableHead className="text-right whitespace-nowrap">Net Amount</TableHead>
              <TableHead className="text-right whitespace-nowrap">Prev. Balance</TableHead>
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.length === 0 && query.trim() !== '' && (
              <TableRow>
                <TableCell colSpan={keys.length + 6} className="text-center text-sm text-muted-foreground py-8">
                  No employee matches “{query.trim()}”.
                </TableCell>
              </TableRow>
            )}
            {visibleRows.map((row) => {
              const d = derived[row.payrollName]
              const status = d.status
              return (
                <TableRow key={row.payrollName}>
                  <TableCell className="font-medium text-sm sticky left-0 bg-background">
                    {row.payrollName}
                  </TableCell>
                  {/*
                    The earnings breakdown is what payroll computed, so it is shown
                    rather than edited. These sum to more than Net Amount: the medical
                    carve-out is offset by a tax exemption and income tax is withheld.
                  */}
                  {row.categories.map((c) => (
                    <TableCell
                      key={c.componentKey}
                      className="text-right tabular-nums text-sm text-muted-foreground"
                    >
                      {money(c.computed)}
                    </TableCell>
                  ))}
                  <TableCell className="text-right tabular-nums text-sm font-medium">
                    {money(row.netSalary)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-sm text-muted-foreground">
                    {money(row.previousBalance)}
                  </TableCell>
                  <TableCell className="text-right p-1">
                    <Input
                      type="number"
                      value={paidNetFor(row)}
                      disabled={!editable}
                      onChange={(e) => setPaid(row.payrollName, e.target.value)}
                      aria-label={`Net amount paid to ${row.payrollName}`}
                      className="h-8 w-28 text-right tabular-nums ml-auto"
                    />
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
