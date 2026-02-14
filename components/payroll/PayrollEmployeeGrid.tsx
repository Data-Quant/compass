'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  Search,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface InputValue {
  payrollName: string
  componentKey: string
  amount: number
}

interface ComputedValue {
  payrollName: string
  metricKey: string
  amount: number
}

interface PreviousData {
  previousInputs: Record<string, Record<string, number>>
  previousComputed: Record<string, Record<string, number>>
}

export interface GridRow {
  payrollName: string
  role?: string
  basicSalary: number
  medicalAllowance: number
  bonus: number
  travelReimbursement: number
  utilityReimbursement: number
  mealsReimbursement: number
  mobileReimbursement: number
  expenseReimbursement: number
  advanceLoan: number
  incomeTax: number
  adjustment: number
  loanRepayment: number
  paid: number
  grossPay: number
  totalReimbursements: number
  totalDeductions: number
  netPay: number
  balance: number
}

type TabKey = 'summary' | 'earnings' | 'deductions'
type SortDir = 'asc' | 'desc' | null
type SortKey = keyof GridRow

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const REIMB_KEYS = new Set([
  'MEDICAL_ALLOWANCE', 'MEDICAL_TAX_EXEMPTION',
  'TRAVEL_REIMBURSEMENT', 'UTILITY_REIMBURSEMENT',
  'MEALS_REIMBURSEMENT', 'MOBILE_REIMBURSEMENT',
  'EXPENSE_REIMBURSEMENT',
])

const DEDUCT_KEYS = new Set(['INCOME_TAX', 'LOAN_REPAYMENT', 'ADJUSTMENT'])

const SUMMARY_COLUMNS: Array<{ key: SortKey; label: string; editable: false }> = [
  { key: 'grossPay', label: 'Gross Pay', editable: false },
  { key: 'bonus', label: 'Bonus', editable: false },
  { key: 'totalReimbursements', label: 'Reimbursements', editable: false },
  { key: 'totalDeductions', label: 'Deductions', editable: false },
  { key: 'netPay', label: 'Net Pay', editable: false },
]

const EARNINGS_COLUMNS: Array<{ key: SortKey; label: string; componentKey?: string; editable: boolean }> = [
  { key: 'basicSalary', label: 'Basic Salary', componentKey: 'BASIC_SALARY', editable: true },
  { key: 'medicalAllowance', label: 'Medical', componentKey: 'MEDICAL_ALLOWANCE', editable: true },
  { key: 'bonus', label: 'Bonus', componentKey: 'BONUS', editable: true },
  { key: 'travelReimbursement', label: 'Travel', componentKey: 'TRAVEL_REIMBURSEMENT', editable: true },
  { key: 'utilityReimbursement', label: 'Utility', componentKey: 'UTILITY_REIMBURSEMENT', editable: true },
  { key: 'mealsReimbursement', label: 'Meals', componentKey: 'MEALS_REIMBURSEMENT', editable: true },
  { key: 'mobileReimbursement', label: 'Mobile', componentKey: 'MOBILE_REIMBURSEMENT', editable: true },
  { key: 'expenseReimbursement', label: 'Expenses', componentKey: 'EXPENSE_REIMBURSEMENT', editable: true },
  { key: 'advanceLoan', label: 'Advance Loan', componentKey: 'ADVANCE_LOAN', editable: true },
]

const DEDUCTION_COLUMNS: Array<{ key: SortKey; label: string; componentKey?: string; editable: boolean }> = [
  { key: 'incomeTax', label: 'Income Tax', componentKey: 'INCOME_TAX', editable: true },
  { key: 'adjustment', label: 'Adjustment', componentKey: 'ADJUSTMENT', editable: true },
  { key: 'loanRepayment', label: 'Loan Repayment', componentKey: 'LOAN_REPAYMENT', editable: true },
  { key: 'paid', label: 'Paid', componentKey: 'PAID', editable: true },
]

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function num(v: unknown) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function money(v: number) {
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function buildGridRows(
  inputValues: InputValue[],
  computedValues: ComputedValue[],
  users?: Array<{ name: string; role?: string }>,
): GridRow[] {
  const map = new Map<string, GridRow>()

  const ensure = (name: string): GridRow => {
    const key = name.trim()
    if (!key) return null as any
    if (!map.has(key)) {
      map.set(key, {
        payrollName: key,
        role: undefined,
        basicSalary: 0, medicalAllowance: 0, bonus: 0,
        travelReimbursement: 0, utilityReimbursement: 0,
        mealsReimbursement: 0, mobileReimbursement: 0,
        expenseReimbursement: 0, advanceLoan: 0,
        incomeTax: 0, adjustment: 0, loanRepayment: 0,
        paid: 0, grossPay: 0, totalReimbursements: 0,
        totalDeductions: 0, netPay: 0, balance: 0,
      })
    }
    return map.get(key)!
  }

  for (const input of inputValues) {
    const row = ensure(input.payrollName)
    if (!row) continue
    const amount = num(input.amount)
    switch (input.componentKey) {
      case 'BASIC_SALARY': row.basicSalary += amount; break
      case 'MEDICAL_ALLOWANCE': row.medicalAllowance += amount; break
      case 'BONUS': row.bonus += amount; break
      case 'TRAVEL_REIMBURSEMENT': row.travelReimbursement += amount; break
      case 'UTILITY_REIMBURSEMENT': row.utilityReimbursement += amount; break
      case 'MEALS_REIMBURSEMENT': row.mealsReimbursement += amount; break
      case 'MOBILE_REIMBURSEMENT': row.mobileReimbursement += amount; break
      case 'EXPENSE_REIMBURSEMENT': row.expenseReimbursement += amount; break
      case 'ADVANCE_LOAN': row.advanceLoan += amount; break
      case 'INCOME_TAX': row.incomeTax += amount; break
      case 'ADJUSTMENT': row.adjustment += amount; break
      case 'LOAN_REPAYMENT': row.loanRepayment += amount; break
      case 'PAID': row.paid += amount; break
    }
  }

  for (const computed of computedValues) {
    const row = ensure(computed.payrollName)
    if (!row) continue
    if (computed.metricKey === 'NET_SALARY') row.netPay = num(computed.amount)
    if (computed.metricKey === 'BALANCE') row.balance = num(computed.amount)
    if (computed.metricKey === 'TOTAL_DEDUCTIONS' && row.totalDeductions === 0) row.totalDeductions = num(computed.amount)
    if (computed.metricKey === 'TOTAL_EARNINGS') row.grossPay = num(computed.amount)
  }

  return Array.from(map.values()).map((row) => {
    row.totalReimbursements =
      row.medicalAllowance + row.travelReimbursement + row.utilityReimbursement +
      row.mealsReimbursement + row.mobileReimbursement + row.expenseReimbursement
    if (!row.totalDeductions) {
      row.totalDeductions = row.incomeTax + row.adjustment + row.loanRepayment
    }
    if (!row.grossPay) {
      row.grossPay = row.basicSalary + row.bonus + row.totalReimbursements + row.advanceLoan
    }
    if (!row.netPay) {
      row.netPay = row.grossPay - row.totalDeductions
    }
    if (!row.balance) {
      row.balance = row.netPay - row.paid
    }
    return row
  }).sort((a, b) => a.payrollName.localeCompare(b.payrollName))
}

function getPreviousValue(prev: PreviousData, payrollName: string, componentKey: string): number | null {
  const inputs = prev.previousInputs[payrollName]
  if (inputs && componentKey in inputs) return inputs[componentKey]
  return null
}

function getPreviousComputed(prev: PreviousData, payrollName: string, metricKey: string): number | null {
  const computed = prev.previousComputed[payrollName]
  if (computed && metricKey in computed) return computed[metricKey]
  return null
}

function getPreviousAggregated(prev: PreviousData, payrollName: string, keys: Set<string>): number {
  const inputs = prev.previousInputs[payrollName]
  if (!inputs) return 0
  let total = 0
  for (const [k, v] of Object.entries(inputs)) {
    if (keys.has(k)) total += v
  }
  return total
}

/* ------------------------------------------------------------------ */
/*  Delta Cell                                                        */
/* ------------------------------------------------------------------ */

function DeltaDisplay({ current, previous }: { current: number; previous: number | null }) {
  if (previous === null) return null
  const delta = current - previous
  if (Math.abs(delta) < 1) return null
  const isPositive = delta > 0
  return (
    <span className={`text-[11px] leading-none ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
      {isPositive ? '+' : ''}{money(delta)}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  Inline Edit Cell                                                   */
/* ------------------------------------------------------------------ */

function InlineEditCell({
  value,
  previousValue,
  onSave,
  disabled,
}: {
  value: number
  previousValue: number | null
  onSave: (newValue: number) => void
  disabled?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus()
  }, [editing])

  const startEdit = () => {
    if (disabled) return
    setDraft(String(value || ''))
    setEditing(true)
  }

  const commitEdit = () => {
    setEditing(false)
    const parsed = Number(draft)
    if (Number.isFinite(parsed) && parsed !== value) {
      onSave(parsed)
    }
  }

  const cancelEdit = () => {
    setEditing(false)
  }

  if (editing) {
    return (
      <Input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitEdit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commitEdit()
          if (e.key === 'Escape') cancelEdit()
          if (e.key === 'Tab') commitEdit()
        }}
        className="h-7 w-24 text-right text-sm px-2 py-0"
        inputMode="decimal"
      />
    )
  }

  return (
    <div
      className={`cursor-pointer rounded px-2 py-1 transition-colors hover:bg-muted/60 text-right min-w-[80px] ${!disabled ? 'group' : ''}`}
      onClick={startEdit}
    >
      <span className="text-sm font-medium">{money(value)}</span>
      <div className="h-3.5">
        <DeltaDisplay current={value} previous={previousValue} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Read-only Cell with delta                                          */
/* ------------------------------------------------------------------ */

function ReadOnlyCell({ value, previousValue }: { value: number; previousValue: number | null }) {
  return (
    <div className="text-right min-w-[80px] px-2 py-1">
      <span className="text-sm font-semibold">{money(value)}</span>
      <div className="h-3.5">
        <DeltaDisplay current={value} previous={previousValue} />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

interface PayrollEmployeeGridProps {
  periodId: string
  inputValues: InputValue[]
  computedValues: ComputedValue[]
  previousData: PreviousData | null
  status: string
  onEmployeeClick?: (payrollName: string) => void
  onDataChange?: () => void
}

export function PayrollEmployeeGrid({
  periodId,
  inputValues,
  computedValues,
  previousData,
  status,
  onEmployeeClick,
  onDataChange,
}: PayrollEmployeeGridProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('summary')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const isLocked = status === 'LOCKED' || status === 'APPROVED' || status === 'SENT'

  const rows = useMemo(
    () => buildGridRows(inputValues, computedValues),
    [inputValues, computedValues],
  )

  const filteredRows = useMemo(() => {
    let result = rows
    const q = searchQuery.trim().toLowerCase()
    if (q) result = result.filter((r) => r.payrollName.toLowerCase().includes(q))
    if (sortKey && sortDir) {
      result = [...result].sort((a, b) => {
        const aVal = a[sortKey]
        const bVal = b[sortKey]
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
        }
        return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number)
      })
    }
    return result
  }, [rows, searchQuery, sortKey, sortDir])

  const totals = useMemo(
    () => filteredRows.reduce<Record<string, number>>((acc, row) => {
      for (const key of Object.keys(row) as (keyof GridRow)[]) {
        if (typeof row[key] === 'number') {
          acc[key] = (acc[key] || 0) + (row[key] as number)
        }
      }
      return acc
    }, {}),
    [filteredRows],
  )

  const toggleSort = useCallback((key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : d === 'desc' ? null : 'asc'))
      if (sortDir === 'desc') setSortKey(null)
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }, [sortKey, sortDir])

  const handleInlineSave = useCallback(async (payrollName: string, componentKey: string, amount: number) => {
    try {
      const res = await fetch(`/api/payroll/periods/${periodId}/inputs`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: [{ payrollName, componentKey, amount }],
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to save')
      }
      onDataChange?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save input')
    }
  }, [periodId, onDataChange])

  const handleCsvExport = useCallback(() => {
    const columns = activeTab === 'earnings' ? EARNINGS_COLUMNS
      : activeTab === 'deductions' ? DEDUCTION_COLUMNS : SUMMARY_COLUMNS
    const header = ['Employee', ...columns.map((c) => c.label)].join(',')
    const csvRows = filteredRows.map((row) => {
      const values = columns.map((c) => row[c.key])
      return [row.payrollName, ...values].join(',')
    })
    const csv = [header, ...csvRows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `payroll-${periodId}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [filteredRows, activeTab, periodId])

  const toggleSelectAll = useCallback(() => {
    if (selected.size === filteredRows.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filteredRows.map((r) => r.payrollName)))
    }
  }, [filteredRows, selected])

  const columns = activeTab === 'earnings' ? EARNINGS_COLUMNS
    : activeTab === 'deductions' ? DEDUCTION_COLUMNS : SUMMARY_COLUMNS

  const SortIcon = ({ colKey }: { colKey: SortKey }) => {
    if (sortKey !== colKey) return <ArrowUpDown className="w-3 h-3 opacity-40" />
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
  }

  /* Helper to get previous value for a summary column */
  const getPrevForColumn = (payrollName: string, col: typeof SUMMARY_COLUMNS[number]): number | null => {
    if (!previousData) return null
    switch (col.key) {
      case 'grossPay': return getPreviousComputed(previousData, payrollName, 'TOTAL_EARNINGS')
      case 'bonus': return previousData.previousInputs[payrollName]?.BONUS ?? null
      case 'totalReimbursements': return getPreviousAggregated(previousData, payrollName, REIMB_KEYS)
      case 'totalDeductions': return getPreviousComputed(previousData, payrollName, 'TOTAL_DEDUCTIONS')
      case 'netPay': return getPreviousComputed(previousData, payrollName, 'NET_SALARY')
      default: return null
    }
  }

  const COMPONENT_KEY_MAP: Record<string, string> = {
    basicSalary: 'BASIC_SALARY',
    medicalAllowance: 'MEDICAL_ALLOWANCE',
    bonus: 'BONUS',
    travelReimbursement: 'TRAVEL_REIMBURSEMENT',
    utilityReimbursement: 'UTILITY_REIMBURSEMENT',
    mealsReimbursement: 'MEALS_REIMBURSEMENT',
    mobileReimbursement: 'MOBILE_REIMBURSEMENT',
    expenseReimbursement: 'EXPENSE_REIMBURSEMENT',
    advanceLoan: 'ADVANCE_LOAN',
    incomeTax: 'INCOME_TAX',
    adjustment: 'ADJUSTMENT',
    loanRepayment: 'LOAN_REPAYMENT',
    paid: 'PAID',
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
          <TabsList>
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="earnings">Earnings</TabsTrigger>
            <TabsTrigger value="deductions">Deductions</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search"
              className="pl-8 h-8 w-48 text-sm"
            />
          </div>
          <Button variant="outline" size="sm" onClick={handleCsvExport}>
            <Download className="w-3.5 h-3.5" />
            CSV
          </Button>
        </div>
      </div>

      {/* Grid */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-10">
                  <Checkbox
                    checked={selected.size === filteredRows.length && filteredRows.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs font-medium"
                    onClick={() => toggleSort('payrollName')}
                  >
                    Full name <SortIcon colKey="payrollName" />
                  </button>
                </TableHead>
                {columns.map((col) => (
                  <TableHead key={col.key} className="text-right">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs font-medium justify-end w-full"
                      onClick={() => toggleSort(col.key)}
                    >
                      {col.label} <SortIcon colKey={col.key} />
                    </button>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRows.map((row) => (
                <TableRow key={row.payrollName} className="group/row">
                  <TableCell className="w-10">
                    <Checkbox
                      checked={selected.has(row.payrollName)}
                      onCheckedChange={(checked) => {
                        setSelected((prev) => {
                          const next = new Set(prev)
                          if (checked) next.add(row.payrollName)
                          else next.delete(row.payrollName)
                          return next
                        })
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      className="text-left hover:text-primary transition-colors"
                      onClick={() => onEmployeeClick?.(row.payrollName)}
                    >
                      <span className="text-sm font-medium">{row.payrollName}</span>
                      {row.role && (
                        <span className="block text-xs text-muted-foreground">{row.role}</span>
                      )}
                    </button>
                  </TableCell>
                  {columns.map((col) => {
                    const value = row[col.key] as number
                    const componentKey = (col as any).componentKey as string | undefined
                    const isEditable = (col as any).editable && !isLocked

                    // Get previous value
                    let prevValue: number | null = null
                    if (previousData) {
                      if (componentKey) {
                        prevValue = getPreviousValue(previousData, row.payrollName, componentKey)
                      } else {
                        prevValue = getPrevForColumn(row.payrollName, col as any)
                      }
                    }

                    return (
                      <TableCell key={col.key} className="p-0">
                        {isEditable && componentKey ? (
                          <InlineEditCell
                            value={value}
                            previousValue={prevValue}
                            onSave={(newVal) => handleInlineSave(row.payrollName, componentKey, newVal)}
                            disabled={isLocked}
                          />
                        ) : (
                          <ReadOnlyCell value={value} previousValue={prevValue} />
                        )}
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))}
              {filteredRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={columns.length + 2} className="text-center py-12 text-muted-foreground">
                    No employees match this search.
                  </TableCell>
                </TableRow>
              )}
              {/* Totals footer */}
              {filteredRows.length > 0 && (
                <TableRow className="bg-muted/40 font-semibold border-t-2">
                  <TableCell />
                  <TableCell className="text-sm">
                    Total ({filteredRows.length} employees)
                  </TableCell>
                  {columns.map((col) => (
                    <TableCell key={col.key} className="text-right px-2 py-1">
                      <span className="text-sm">{money(totals[col.key] || 0)}</span>
                    </TableCell>
                  ))}
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
