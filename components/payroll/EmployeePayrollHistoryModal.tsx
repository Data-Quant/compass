'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Separator } from '@/components/ui/separator'
import { PayrollStatusBadge } from '@/components/payroll/PayrollStatusBadge'
import { PayrollPayStub } from '@/components/payroll/PayrollPayStub'
import { FileText } from 'lucide-react'

interface HistoryLineItem {
  key: string
  label: string
  amount: number
  kind: 'EARNING' | 'DEDUCTION'
}

interface HistoryReceipt {
  id: string
  status: string
  receiptJson: unknown
}

interface HistoryPeriod {
  periodId: string
  periodLabel: string
  periodStart: string
  periodStatus: string
  lineItems: HistoryLineItem[]
  totals: { totalEarnings: number; totalDeductions: number; netSalary: number }
  receipt: HistoryReceipt | null
}

interface EmployeePayrollHistoryModalProps {
  employee: { id: string; name: string } | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function money(value: number): string {
  return `PKR ${Math.round(value).toLocaleString()}`
}

function MonthBlock({ period, employeeName }: { period: HistoryPeriod; employeeName: string }) {
  const [showPayslip, setShowPayslip] = useState(false)
  const earnings = period.lineItems.filter((l) => l.kind === 'EARNING')
  const deductions = period.lineItems.filter((l) => l.kind === 'DEDUCTION')

  return (
    <div className="rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold font-display">{period.periodLabel}</h4>
          <PayrollStatusBadge status={period.periodStatus} />
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Net Salary</p>
          <p className="text-base font-bold tabular-nums text-primary">{money(period.totals.netSalary)}</p>
        </div>
      </div>

      <Separator className="my-3" />

      {period.lineItems.length === 0 ? (
        <p className="text-xs text-muted-foreground">No category breakdown recorded for this month.</p>
      ) : (
        <div className="space-y-3">
          {earnings.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground mb-1">Earnings</p>
              {earnings.map((l) => (
                <div key={l.key} className="flex items-center justify-between py-0.5">
                  <span className="text-sm text-muted-foreground">{l.label}</span>
                  <span className="text-sm tabular-nums">{money(l.amount)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-1 font-medium">
                <span className="text-sm">Total Earnings</span>
                <span className="text-sm tabular-nums">{money(period.totals.totalEarnings)}</span>
              </div>
            </div>
          )}

          {deductions.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground mb-1">Deductions</p>
              {deductions.map((l) => (
                <div key={l.key} className="flex items-center justify-between py-0.5">
                  <span className="text-sm text-muted-foreground">{l.label}</span>
                  <span className="text-sm tabular-nums">{money(Math.abs(l.amount))}</span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-1 font-medium">
                <span className="text-sm">Total Deductions</span>
                <span className="text-sm tabular-nums">{money(period.totals.totalDeductions)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {period.receipt && (
        <div className="mt-3">
          <Button variant="outline" size="sm" onClick={() => setShowPayslip((v) => !v)}>
            <FileText className="w-3.5 h-3.5 mr-1.5" />
            {showPayslip ? 'Hide payslip' : 'View payslip'}
          </Button>
          {showPayslip && (
            <div className="mt-3">
              <PayrollPayStub
                payrollName={employeeName}
                periodLabel={period.periodLabel}
                receiptJson={(period.receipt.receiptJson as any) ?? null}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function EmployeePayrollHistoryModal({ employee, open, onOpenChange }: EmployeePayrollHistoryModalProps) {
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<HistoryPeriod[]>([])

  useEffect(() => {
    if (!open || !employee) return
    let cancelled = false
    setLoading(true)
    setHistory([])
    fetch(`/api/payroll/employees/${employee.id}/history`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed to load payroll history')
        if (!cancelled) setHistory(data.history || [])
      })
      .catch((error) => {
        if (!cancelled) toast.error(error instanceof Error ? error.message : 'Failed to load payroll history')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, employee])

  return (
    <Modal
      isOpen={open}
      onClose={() => onOpenChange(false)}
      title={employee ? `Payroll History — ${employee.name}` : 'Payroll History'}
    >
      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading payroll history...</p>
      ) : history.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">
          <p className="text-sm">No payroll history found for this employee.</p>
          <p className="text-xs mt-1">History appears once they are included in a calculated payroll period.</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">
          {history.map((period) => (
            <MonthBlock key={period.periodId} period={period} employeeName={employee?.name || ''} />
          ))}
        </div>
      )}
    </Modal>
  )
}
