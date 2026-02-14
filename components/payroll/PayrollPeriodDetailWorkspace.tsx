'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AppNavbar } from '@/components/layout/AppNavbar'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { PayrollStatusBadge } from '@/components/payroll/PayrollStatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  CalendarDays,
  Calculator,
  CheckCircle2,
  FileSignature,
  Link2,
  Loader2,
  ReceiptText,
  RefreshCcw,
  Save,
  Search,
  Upload,
  Users,
  Wallet,
} from 'lucide-react'
import { PAYROLL_COMPONENT_KEYS } from '@/lib/payroll/config'

interface DetailProps {
  appBasePath: '/oa' | '/admin'
  periodId: string
  badge: string
}

type PendingAction = 'recalculate' | 'approve' | 'send' | 'sync' | 'none'
type PayrollPanel = 'run' | 'expenses' | 'reconciliation' | 'receipts' | 'approvals'

function canAccessPayrollWorkspace(role: string | null | undefined, appBasePath: DetailProps['appBasePath']) {
  if (appBasePath === '/admin') return role === 'HR'
  return role === 'OA'
}

function num(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function money(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

export function PayrollPeriodDetailWorkspace({ appBasePath, periodId, badge }: DetailProps) {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [pendingAction, setPendingAction] = useState<PendingAction>('none')
  const [activePanel, setActivePanel] = useState<PayrollPanel>('run')
  const [employeeQuery, setEmployeeQuery] = useState('')
  const [period, setPeriod] = useState<any>(null)
  const [selectedReceiptId, setSelectedReceiptId] = useState<string | undefined>()

  const [inputForm, setInputForm] = useState({
    payrollName: '',
    componentKey: 'BASIC_SALARY',
    amount: '',
    note: '',
  })
  const [expenseForm, setExpenseForm] = useState({
    payrollName: '',
    categoryKey: 'ADJUSTMENT',
    amount: '',
    description: '',
  })
  const [approvalComment, setApprovalComment] = useState('')

  useEffect(() => {
    fetch('/api/auth/session')
      .then((res) => res.json())
      .then((data) => {
        if (!data.user || !canAccessPayrollWorkspace(data.user.role, appBasePath)) {
          router.push('/login')
          return
        }
        setUser(data.user)
        return loadPeriod()
      })
      .catch(() => router.push('/login'))
  }, [periodId])

  const loadPeriod = async () => {
    try {
      const res = await fetch(`/api/payroll/periods/${periodId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load payroll period')
      setPeriod(data.period)
      if (data.period?.receipts?.length > 0) setSelectedReceiptId((prev) => prev || data.period.receipts[0].id)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load payroll period')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const runAction = async (action: Exclude<PendingAction, 'none'>) => {
    try {
      setPendingAction(action)
      let endpoint = ''
      let body: Record<string, unknown> = {}
      if (action === 'recalculate') endpoint = `/api/payroll/periods/${periodId}/recalculate`
      if (action === 'approve') {
        endpoint = `/api/payroll/periods/${periodId}/approve`
        body = { comment: approvalComment || undefined }
      }
      if (action === 'send') endpoint = `/api/payroll/periods/${periodId}/send-docusign`
      if (action === 'sync') endpoint = `/api/payroll/periods/${periodId}/docusign/sync`

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Failed to run ${action}`)
      if (action === 'approve') setApprovalComment('')
      toast.success(`Payroll ${action} completed`)
      await loadPeriod()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to run ${action}`)
    } finally {
      setPendingAction('none')
    }
  }

  const submitInputUpdate = async (event: FormEvent) => {
    event.preventDefault()
    const amount = Number(inputForm.amount)
    if (!inputForm.payrollName.trim() || !Number.isFinite(amount)) {
      toast.error('Provide payroll name and numeric amount')
      return
    }
    try {
      const res = await fetch(`/api/payroll/periods/${periodId}/inputs`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: [{ payrollName: inputForm.payrollName.trim(), componentKey: inputForm.componentKey, amount, note: inputForm.note || undefined }],
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update payroll input')
      toast.success('Input value updated')
      setInputForm((prev) => ({ ...prev, amount: '', note: '' }))
      await loadPeriod()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update payroll input')
    }
  }

  const submitExpenseUpdate = async (event: FormEvent) => {
    event.preventDefault()
    const amount = Number(expenseForm.amount)
    if (!Number.isFinite(amount)) {
      toast.error('Provide numeric expense amount')
      return
    }
    try {
      const res = await fetch(`/api/payroll/periods/${periodId}/inputs`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: [],
          expenses: [{ payrollName: expenseForm.payrollName.trim() || undefined, categoryKey: expenseForm.categoryKey.trim(), amount, description: expenseForm.description.trim() || undefined }],
          replaceExpenses: false,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add expense entry')
      toast.success('Expense entry added')
      setExpenseForm((prev) => ({ ...prev, amount: '', description: '' }))
      await loadPeriod()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add expense entry')
    }
  }

  const mismatches = useMemo(() => ((period?.summaryJson as any)?.mismatches || []), [period])

  const gridRows = useMemo(() => {
    const map = new Map<string, any>()
    const ensure = (name: string) => {
      const key = name.trim()
      if (!key) return null
      if (!map.has(key)) map.set(key, { payrollName: key, basic: 0, bonus: 0, reimbursements: 0, deductions: 0, paid: 0, net: 0, balance: 0 })
      return map.get(key)
    }
    const reimb = new Set(['MEDICAL_ALLOWANCE', 'MEDICAL_TAX_EXEMPTION', 'TRAVEL_REIMBURSEMENT', 'UTILITY_REIMBURSEMENT', 'MEALS_REIMBURSEMENT', 'MOBILE_REIMBURSEMENT', 'EXPENSE_REIMBURSEMENT'])
    const deduct = new Set(['INCOME_TAX', 'LOAN_REPAYMENT', 'ADJUSTMENT'])

    for (const input of period?.inputValues || []) {
      const row = ensure(String(input.payrollName || ''))
      if (!row) continue
      const key = String(input.componentKey || '')
      const amount = num(input.amount)
      if (key === 'BASIC_SALARY') row.basic += amount
      else if (key === 'BONUS') row.bonus += amount
      else if (key === 'PAID') row.paid += amount
      else if (reimb.has(key)) row.reimbursements += amount
      else if (deduct.has(key)) row.deductions += amount
    }

    for (const computed of period?.computedValues || []) {
      const row = ensure(String(computed.payrollName || ''))
      if (!row) continue
      const key = String(computed.metricKey || '')
      const amount = num(computed.amount)
      if (key === 'NET_SALARY') row.net = amount
      if (key === 'BALANCE') row.balance = amount
      if (key === 'TOTAL_DEDUCTIONS' && row.deductions === 0) row.deductions = amount
    }

    return Array.from(map.values())
      .map((row) => {
        const fallbackNet = row.basic + row.bonus + row.reimbursements - row.deductions
        const net = row.net || fallbackNet
        return { ...row, net, balance: row.balance || net - row.paid }
      })
      .sort((a, b) => a.payrollName.localeCompare(b.payrollName))
  }, [period])

  const filteredRows = useMemo(() => {
    const q = employeeQuery.trim().toLowerCase()
    if (!q) return gridRows
    return gridRows.filter((row) => row.payrollName.toLowerCase().includes(q))
  }, [gridRows, employeeQuery])

  const totals = useMemo(() => filteredRows.reduce((acc, row) => ({
    basic: acc.basic + row.basic,
    bonus: acc.bonus + row.bonus,
    reimbursements: acc.reimbursements + row.reimbursements,
    deductions: acc.deductions + row.deductions,
    paid: acc.paid + row.paid,
    net: acc.net + row.net,
    balance: acc.balance + row.balance,
  }), { basic: 0, bonus: 0, reimbursements: 0, deductions: 0, paid: 0, net: 0, balance: 0 }), [filteredRows])

  const selectedReceipt = useMemo(() => {
    if (!period?.receipts?.length) return null
    if (!selectedReceiptId) return period.receipts[0]
    return period.receipts.find((receipt: any) => receipt.id === selectedReceiptId) || period.receipts[0]
  }, [period, selectedReceiptId])

  if (loading) return <LoadingScreen message="Loading payroll period..." />

  if (!period) {
    return (
      <div className="min-h-screen bg-background">
        <AppNavbar user={user} onLogout={handleLogout} badge={badge} />
        <main className="max-w-5xl mx-auto px-4 py-12">
          <Card><CardContent className="p-8 text-center"><p className="text-muted-foreground">Payroll period not found.</p><Button className="mt-4" asChild><Link href={`${appBasePath}/payroll`}>Back to Payroll</Link></Button></CardContent></Card>
        </main>
      </div>
    )
  }

  const navItems: Array<{ key: PayrollPanel; label: string }> = [
    { key: 'run', label: 'Run Payroll' },
    { key: 'expenses', label: 'Expenses' },
    { key: 'reconciliation', label: 'Reconciliation' },
    { key: 'receipts', label: 'Receipts' },
    { key: 'approvals', label: 'Review & Submit' },
  ]

  return (
    <div className="min-h-screen bg-background">
      <AppNavbar user={user} onLogout={handleLogout} badge={badge} />

      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
          <div className="grid grid-cols-1 lg:grid-cols-[220px,1fr] min-h-[70vh]">
            <aside className="border-r border-border bg-muted/25 p-4 flex flex-col">
              <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{badge}</p>
              <h2 className="text-lg font-semibold mt-1">Payroll Console</h2>
              <p className="text-xs text-muted-foreground">{period.label}</p>
              <nav className="mt-4 space-y-1">
                {navItems.map((item) => (
                  <button key={item.key} type="button" onClick={() => setActivePanel(item.key)} className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${activePanel === item.key ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-foreground'}`}>
                    {item.label}
                  </button>
                ))}
              </nav>
              <Separator className="my-4" />
              <div className="space-y-2 text-xs">
                <p className="flex justify-between"><span className="inline-flex items-center gap-1 text-muted-foreground"><Users className="w-3 h-3" />Employees</span><span>{gridRows.length}</span></p>
                <p className="flex justify-between"><span className="inline-flex items-center gap-1 text-muted-foreground"><Wallet className="w-3 h-3" />Net Pay</span><span>PKR {money(totals.net)}</span></p>
                <p className="flex justify-between"><span className="inline-flex items-center gap-1 text-muted-foreground"><Link2 className="w-3 h-3" />Mismatches</span><span>{mismatches.length}</span></p>
              </div>
              <div className="mt-auto pt-4 space-y-2">
                <Button variant="outline" className="w-full justify-start" asChild><Link href={`${appBasePath}/payroll`}>Payroll History</Link></Button>
                <Button variant="ghost" className="w-full justify-start" asChild><Link href="/admin/mappings">Identity Mappings</Link></Button>
              </div>
            </aside>

            <section className="min-w-0">
              <div className="border-b border-border px-4 sm:px-6 py-4 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Run payroll / {period.label}</p>
                    <h1 className="text-2xl font-semibold">Regular payroll for {period.label}</h1>
                  </div>
                  <PayrollStatusBadge status={period.status} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                  <div className="rounded-lg border border-border p-3 text-sm"><p className="text-xs text-muted-foreground inline-flex items-center gap-1"><CalendarDays className="w-3 h-3" />Run by</p><p className="font-semibold mt-1">{new Date(period.periodStart).toLocaleDateString()}</p></div>
                  <div className="rounded-lg border border-border p-3 text-sm"><p className="text-xs text-muted-foreground inline-flex items-center gap-1"><CalendarDays className="w-3 h-3" />Payday</p><p className="font-semibold mt-1">{new Date(period.periodEnd).toLocaleDateString()}</p></div>
                  <div className="rounded-lg border border-border p-3 text-sm"><p className="text-xs text-muted-foreground inline-flex items-center gap-1"><Users className="w-3 h-3" />Employees</p><p className="font-semibold mt-1">{filteredRows.length}</p></div>
                  <div className="rounded-lg border border-border p-3 text-sm"><p className="text-xs text-muted-foreground inline-flex items-center gap-1"><Wallet className="w-3 h-3" />Total net pay</p><p className="font-semibold mt-1">PKR {money(totals.net)}</p></div>
                </div>
                <div className="grid grid-cols-[1fr,auto] gap-3 items-center">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input value={employeeQuery} onChange={(event) => setEmployeeQuery(event.target.value)} placeholder="Search employees" className="pl-9" />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => runAction('recalculate')} disabled={pendingAction !== 'none'}>{pendingAction === 'recalculate' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />}Recalculate</Button>
                    <Button onClick={() => runAction('approve')} disabled={pendingAction !== 'none'}>{pendingAction === 'approve' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}Review</Button>
                    <Button variant="secondary" onClick={() => runAction('send')} disabled={pendingAction !== 'none'}>{pendingAction === 'send' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSignature className="w-4 h-4" />}Submit</Button>
                    <Button variant="outline" onClick={() => runAction('sync')} disabled={pendingAction !== 'none'}>{pendingAction === 'sync' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}Sync</Button>
                  </div>
                </div>
              </div>

              <div className="p-4 sm:p-6 space-y-6">
                {activePanel === 'run' && (
                  <>
                    <div className="rounded-xl border border-border overflow-hidden">
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/50">
                              <TableHead>Employee</TableHead>
                              <TableHead>Total Pay</TableHead>
                              <TableHead>Basic Salary</TableHead>
                              <TableHead>Bonus</TableHead>
                              <TableHead>Reimbursements</TableHead>
                              <TableHead>Deductions</TableHead>
                              <TableHead>Paid</TableHead>
                              <TableHead>Balance</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {filteredRows.map((row) => (
                              <TableRow key={row.payrollName}>
                                <TableCell className="font-medium">{row.payrollName}</TableCell>
                                <TableCell>PKR {money(row.net)}</TableCell>
                                <TableCell>{money(row.basic)}</TableCell>
                                <TableCell>{money(row.bonus)}</TableCell>
                                <TableCell>{money(row.reimbursements)}</TableCell>
                                <TableCell>{money(row.deductions)}</TableCell>
                                <TableCell>{money(row.paid)}</TableCell>
                                <TableCell>{money(row.balance)}</TableCell>
                              </TableRow>
                            ))}
                            {filteredRows.length === 0 && (
                              <TableRow>
                                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No employees match this search.</TableCell>
                              </TableRow>
                            )}
                            {filteredRows.length > 0 && (
                              <TableRow className="bg-muted/40 font-medium">
                                <TableCell>Total</TableCell>
                                <TableCell>PKR {money(totals.net)}</TableCell>
                                <TableCell>{money(totals.basic)}</TableCell>
                                <TableCell>{money(totals.bonus)}</TableCell>
                                <TableCell>{money(totals.reimbursements)}</TableCell>
                                <TableCell>{money(totals.deductions)}</TableCell>
                                <TableCell>{money(totals.paid)}</TableCell>
                                <TableCell>{money(totals.balance)}</TableCell>
                              </TableRow>
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                      <Card>
                        <CardContent className="p-6">
                          <h2 className="font-semibold mb-4">Add or Override Input</h2>
                          <form onSubmit={submitInputUpdate} className="space-y-3">
                            <div className="space-y-1.5">
                              <Label>Payroll Name</Label>
                              <Input value={inputForm.payrollName} onChange={(event) => setInputForm((prev) => ({ ...prev, payrollName: event.target.value }))} placeholder="Employee payroll name" required />
                            </div>
                            <div className="space-y-1.5">
                              <Label>Component</Label>
                              <Select value={inputForm.componentKey} onValueChange={(value) => setInputForm((prev) => ({ ...prev, componentKey: value }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {PAYROLL_COMPONENT_KEYS.map((component) => <SelectItem key={component} value={component}>{component}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label>Amount</Label>
                              <Input value={inputForm.amount} onChange={(event) => setInputForm((prev) => ({ ...prev, amount: event.target.value }))} placeholder="0" inputMode="decimal" required />
                            </div>
                            <div className="space-y-1.5">
                              <Label>Note</Label>
                              <Textarea value={inputForm.note} onChange={(event) => setInputForm((prev) => ({ ...prev, note: event.target.value }))} placeholder="Reason for adjustment" rows={2} />
                            </div>
                            <Button type="submit" className="w-full"><Save className="w-4 h-4" />Save Input</Button>
                          </form>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-6">
                          <h2 className="font-semibold mb-2">Submission Readiness</h2>
                          <p className="text-sm text-muted-foreground mb-4">Recalculate before approval. Approval is required before sending DocuSign receipts.</p>
                          <div className="space-y-3 text-sm">
                            <div className="flex items-center justify-between rounded-md border border-border p-3"><span className="text-muted-foreground">Mismatches</span><span className="font-medium">{mismatches.length}</span></div>
                            <div className="flex items-center justify-between rounded-md border border-border p-3"><span className="text-muted-foreground">Receipts</span><span className="font-medium">{period.receipts?.length || 0}</span></div>
                            <div className="flex items-center justify-between rounded-md border border-border p-3"><span className="text-muted-foreground">Input rows</span><span className="font-medium">{period.inputValues?.length || 0}</span></div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </>
                )}

                {activePanel === 'expenses' && (
                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    <Card className="xl:col-span-1">
                      <CardContent className="p-6">
                        <h2 className="font-semibold mb-4">Add Expense</h2>
                        <form onSubmit={submitExpenseUpdate} className="space-y-3">
                          <div className="space-y-1.5"><Label>Payroll Name (optional)</Label><Input value={expenseForm.payrollName} onChange={(event) => setExpenseForm((prev) => ({ ...prev, payrollName: event.target.value }))} /></div>
                          <div className="space-y-1.5"><Label>Category</Label><Input value={expenseForm.categoryKey} onChange={(event) => setExpenseForm((prev) => ({ ...prev, categoryKey: event.target.value }))} required /></div>
                          <div className="space-y-1.5"><Label>Amount</Label><Input value={expenseForm.amount} onChange={(event) => setExpenseForm((prev) => ({ ...prev, amount: event.target.value }))} required /></div>
                          <div className="space-y-1.5"><Label>Description</Label><Textarea value={expenseForm.description} onChange={(event) => setExpenseForm((prev) => ({ ...prev, description: event.target.value }))} rows={2} /></div>
                          <Button type="submit" className="w-full" variant="outline"><Upload className="w-4 h-4" />Add Expense</Button>
                        </form>
                      </CardContent>
                    </Card>
                    <Card className="xl:col-span-2">
                      <CardContent className="p-0">
                        <div className="p-6 border-b border-border"><h2 className="font-semibold">Expense Entries</h2></div>
                        <Table>
                          <TableHeader><TableRow className="bg-muted/50"><TableHead>Category</TableHead><TableHead>Payroll Name</TableHead><TableHead>Amount</TableHead><TableHead>Description</TableHead></TableRow></TableHeader>
                          <TableBody>
                            {(period.expenseEntries || []).slice(0, 200).map((entry: any) => (
                              <TableRow key={entry.id}><TableCell>{entry.categoryKey}</TableCell><TableCell>{entry.payrollName || '-'}</TableCell><TableCell>{money(num(entry.amount))}</TableCell><TableCell className="max-w-[320px] truncate">{entry.description || '-'}</TableCell></TableRow>
                            ))}
                            {(!period.expenseEntries || period.expenseEntries.length === 0) && <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No expenses recorded.</TableCell></TableRow>}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {activePanel === 'reconciliation' && (
                  <Card>
                    <CardContent className="p-0">
                      <div className="p-6 border-b border-border"><h2 className="font-semibold">Mismatch Report</h2></div>
                      <Table>
                        <TableHeader><TableRow className="bg-muted/50"><TableHead>Payroll Name</TableHead><TableHead>Check</TableHead><TableHead>Expected</TableHead><TableHead>Actual</TableHead><TableHead>Delta</TableHead><TableHead>Severity</TableHead></TableRow></TableHeader>
                        <TableBody>
                          {mismatches.map((item: any, index: number) => (
                            <TableRow key={`${item.payrollName}-${index}`}><TableCell className="font-medium">{item.payrollName}</TableCell><TableCell>{item.check}</TableCell><TableCell>{money(num(item.expected))}</TableCell><TableCell>{money(num(item.actual))}</TableCell><TableCell>{money(num(item.delta))}</TableCell><TableCell>{item.severity}</TableCell></TableRow>
                          ))}
                          {mismatches.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No mismatches found at current tolerance.</TableCell></TableRow>}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                )}
                {activePanel === 'receipts' && (
                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                    <Card className="xl:col-span-1">
                      <CardContent className="p-6 space-y-3">
                        <h2 className="font-semibold">Receipt Selector</h2>
                        <Select value={selectedReceiptId} onValueChange={setSelectedReceiptId}>
                          <SelectTrigger><SelectValue placeholder="Select receipt" /></SelectTrigger>
                          <SelectContent>{(period.receipts || []).map((receipt: any) => <SelectItem key={receipt.id} value={receipt.id}>{receipt.payrollName}</SelectItem>)}</SelectContent>
                        </Select>
                        <p className="text-sm text-muted-foreground">DocuSign status and receipt JSON are generated from computed payroll metrics.</p>
                      </CardContent>
                    </Card>
                    <Card className="xl:col-span-2">
                      <CardContent className="p-6 space-y-4">
                        {!selectedReceipt && <p className="text-muted-foreground">No receipt available.</p>}
                        {selectedReceipt && (
                          <>
                            <div className="flex items-center justify-between">
                              <div>
                                <h3 className="text-lg font-semibold">{selectedReceipt.payrollName}</h3>
                                <p className="text-sm text-muted-foreground">Recipient: {selectedReceipt.user?.name || 'Unmapped'} ({selectedReceipt.user?.email || 'no email'})</p>
                              </div>
                              <PayrollStatusBadge status={selectedReceipt.status} />
                            </div>
                            <div className="rounded-lg border border-border p-4 bg-muted/20"><pre className="text-xs whitespace-pre-wrap break-all">{JSON.stringify(selectedReceipt.receiptJson, null, 2)}</pre></div>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )}

                {activePanel === 'approvals' && (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <Card>
                      <CardContent className="p-6 space-y-3">
                        <h2 className="font-semibold">Approval Comment</h2>
                        <Textarea value={approvalComment} onChange={(event) => setApprovalComment(event.target.value)} placeholder="Optional approval note" rows={4} />
                        <div className="flex flex-wrap gap-2">
                          <Button onClick={() => runAction('approve')} disabled={pendingAction !== 'none'}><CheckCircle2 className="w-4 h-4" />Approve Period</Button>
                          <Button variant="outline" onClick={() => runAction('recalculate')} disabled={pendingAction !== 'none'}><Calculator className="w-4 h-4" />Recalculate</Button>
                          <Button variant="secondary" onClick={() => runAction('send')} disabled={pendingAction !== 'none'}><FileSignature className="w-4 h-4" />Send DocuSign</Button>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-0">
                        <div className="p-6 border-b border-border"><h2 className="font-semibold">Approval Events</h2></div>
                        <Table>
                          <TableHeader><TableRow className="bg-muted/50"><TableHead>Actor</TableHead><TableHead>Transition</TableHead><TableHead>Comment</TableHead><TableHead>Date</TableHead></TableRow></TableHeader>
                          <TableBody>
                            {(period.approvalEvents || []).map((event: any) => (
                              <TableRow key={event.id}><TableCell>{event.actor?.name || 'Unknown'}</TableCell><TableCell>{(event.fromStatus || '-')} {'->'} {event.toStatus}</TableCell><TableCell className="max-w-[220px] truncate">{event.comment || '-'}</TableCell><TableCell>{new Date(event.createdAt).toLocaleString()}</TableCell></TableRow>
                            ))}
                            {(!period.approvalEvents || period.approvalEvents.length === 0) && <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No approval events yet.</TableCell></TableRow>}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>

        <div className="mt-4 px-1 text-xs text-muted-foreground inline-flex items-center gap-2">
          <ReceiptText className="w-3.5 h-3.5" />
          Values are rendered from current period inputs and computed metrics.
        </div>
      </main>
    </div>
  )
}
