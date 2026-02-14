'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { AppNavbar } from '@/components/layout/AppNavbar'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { PayrollStatusBadge } from '@/components/payroll/PayrollStatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ArrowRight,
  CheckCircle2,
  CircleHelp,
  FileSpreadsheet,
  Loader2,
  ReceiptText,
} from 'lucide-react'

interface WorkspaceProps {
  appBasePath: '/oa' | '/admin'
  badge: string
  heading: string
  description: string
}

interface PeriodRow {
  id: string
  label: string
  periodStart: string
  periodEnd: string
  status: string
  sourceType: string
  _count: {
    inputValues: number
    computedValues: number
    receipts: number
    expenseEntries: number
    importBatches: number
  }
}

interface DashboardPayload {
  statusCounts: Record<string, number>
  mappingCounts: Record<string, number>
  envelopeCounts: Record<string, number>
}

type SourceMode = 'WORKBOOK' | 'MANUAL' | 'CARRY_FORWARD'

function canAccessPayrollWorkspace(role: string | null | undefined, appBasePath: WorkspaceProps['appBasePath']) {
  if (appBasePath === '/admin') return role === 'HR'
  return role === 'OA'
}

export function PayrollPeriodsWorkspace({
  appBasePath,
  badge,
  heading,
  description,
}: WorkspaceProps) {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [periods, setPeriods] = useState<PeriodRow[]>([])
  const [dashboard, setDashboard] = useState<DashboardPayload>({
    statusCounts: {},
    mappingCounts: {},
    envelopeCounts: {},
  })

  const [label, setLabel] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [sourceMode, setSourceMode] = useState<SourceMode>('CARRY_FORWARD')
  const [basePeriodId, setBasePeriodId] = useState('AUTO')

  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadPeriodId, setUploadPeriodId] = useState('AUTO')
  const [backfilling, setBackfilling] = useState(false)
  const [backfillFile, setBackfillFile] = useState<File | null>(null)
  const [backfillMonths, setBackfillMonths] = useState('12')
  const [backfillUseRosterNames, setBackfillUseRosterNames] = useState(true)
  const [backfillLockApproved, setBackfillLockApproved] = useState(true)
  const [backfillOverwriteLocked, setBackfillOverwriteLocked] = useState(false)
  const [backfillPersistRows, setBackfillPersistRows] = useState(false)

  useEffect(() => {
    fetch('/api/auth/session')
      .then((res) => res.json())
      .then((data) => {
        if (!data.user || !canAccessPayrollWorkspace(data.user.role, appBasePath)) {
          router.push('/login')
          return
        }
        setUser(data.user)
        return loadData()
      })
      .catch(() => router.push('/login'))
  }, [])

  const loadData = async () => {
    try {
      const [periodsRes, dashboardRes] = await Promise.all([
        fetch('/api/payroll/periods'),
        fetch('/api/payroll/dashboard'),
      ])
      const periodsJson = await periodsRes.json()
      const dashboardJson = await dashboardRes.json()

      if (!periodsRes.ok) {
        throw new Error(periodsJson.error || 'Failed to load payroll periods')
      }
      if (!dashboardRes.ok) {
        throw new Error(dashboardJson.error || 'Failed to load payroll dashboard')
      }

      setPeriods(periodsJson.periods || [])
      setDashboard({
        statusCounts: dashboardJson.statusCounts || {},
        mappingCounts: dashboardJson.mappingCounts || {},
        envelopeCounts: dashboardJson.envelopeCounts || {},
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load payroll workspace'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const handleCreatePeriod = async (event: FormEvent) => {
    event.preventDefault()
    setCreating(true)
    try {
      if (!periodStart || !periodEnd) {
        throw new Error('Start date and end date are required')
      }

      const payload: Record<string, unknown> = {
        label: label || undefined,
        periodStart,
        periodEnd,
        sourceMode,
      }
      if (sourceMode === 'CARRY_FORWARD' && basePeriodId !== 'AUTO') {
        payload.basePeriodId = basePeriodId
      }

      const res = await fetch('/api/payroll/periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create payroll period')
      }

      toast.success('Payroll period created')
      setLabel('')
      setBasePeriodId('AUTO')
      await loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create payroll period')
    } finally {
      setCreating(false)
    }
  }

  const handleWorkbookUpload = async (event: FormEvent) => {
    event.preventDefault()
    if (!uploadFile) {
      toast.error('Select an Excel workbook before uploading')
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', uploadFile)
      if (uploadPeriodId !== 'AUTO') formData.append('periodId', uploadPeriodId)
      formData.append('sourceType', 'WORKBOOK')

      const res = await fetch('/api/payroll/import', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to import workbook')
      }

      toast.success(
        `Workbook imported: ${data.summary?.importedInputs || 0} inputs, ${data.summary?.importedExpenses || 0} expenses`
      )
      setUploadFile(null)
      setUploadPeriodId('AUTO')
      await loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to import workbook')
    } finally {
      setUploading(false)
    }
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  const handleBackfill = async (event: FormEvent) => {
    event.preventDefault()
    if (!backfillFile) {
      toast.error('Select an Excel workbook for backfill')
      return
    }
    setBackfilling(true)
    try {
      const requestedMonths = Math.max(1, Math.min(120, Number(backfillMonths || '12') || 12))

      // Overwrite mode reprocesses locked periods; keep it single-call to avoid duplicate windows.
      const runs = backfillOverwriteLocked ? 1 : requestedMonths
      const monthsPerRun = backfillOverwriteLocked ? requestedMonths : 1

      if (backfillOverwriteLocked && requestedMonths > 3) {
        toast.warning(
          'Overwrite mode can take longer for large ranges. Consider disabling overwrite for faster incremental backfill.'
        )
      }

      let totalProcessed = 0
      let totalLocked = 0
      let totalBlocked = 0

      for (let run = 0; run < runs; run++) {
        const formData = new FormData()
        formData.append('file', backfillFile)
        formData.append('months', String(monthsPerRun))
        formData.append('tolerance', '1')
        formData.append('lockApproved', String(backfillLockApproved))
        formData.append('useEmployeeRosterNames', String(backfillUseRosterNames))
        formData.append('overwriteLocked', String(backfillOverwriteLocked && run === 0))
        formData.append('persistImportRows', String(backfillPersistRows))

        const res = await fetch('/api/payroll/backfill', {
          method: 'POST',
          body: formData,
        })
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.error || data.details || 'Backfill failed')
        }

        const summary = data.summary || {}
        totalProcessed += Number(summary.periodsProcessed || 0)
        totalLocked += Number(summary.periodsLocked || 0)
        totalBlocked += Number(summary.periodsBlocked || 0)

        if (!backfillOverwriteLocked && Number(summary.periodsProcessed || 0) === 0 && Number(summary.periodsBlocked || 0) === 0) {
          break
        }
      }

      toast.success(
        `Backfill done: ${totalProcessed} recalculated, ${totalLocked} locked, ${totalBlocked} blocked.`
      )
      setBackfillFile(null)
      await loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Backfill failed')
    } finally {
      setBackfilling(false)
    }
  }

  const unresolvedMappings = dashboard.mappingCounts.UNRESOLVED || 0
  const ambiguousMappings = dashboard.mappingCounts.AMBIGUOUS || 0
  const pendingApprovals = dashboard.statusCounts.CALCULATED || 0
  const pendingSend = (dashboard.statusCounts.APPROVED || 0) + (dashboard.statusCounts.SENDING || 0)

  const latestPeriods = useMemo(() => periods.slice(0, 12), [periods])

  if (loading) {
    return <LoadingScreen message="Loading payroll workspace..." />
  }

  return (
    <div className="min-h-screen bg-background">
      <AppNavbar user={user} onLogout={handleLogout} badge={badge} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-[28px] border border-border bg-gradient-to-br from-primary/20 via-background to-secondary/10"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.16),transparent_48%)]" />
          <div className="relative p-6 sm:p-8 lg:p-10 grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 space-y-4">
              <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{badge}</p>
              <h1 className="text-3xl sm:text-4xl font-display leading-tight">{heading}</h1>
              <p className="text-muted-foreground max-w-2xl">
                Fast, accurate, and repeatable payroll for every month. {description}
              </p>
              <div className="flex flex-wrap gap-3 pt-1">
                <Button asChild>
                  <a href="#operations">
                    Run Monthly Payroll
                    <ArrowRight className="w-4 h-4" />
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <a href="#periods">Review Periods</a>
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Card className="bg-background/75 backdrop-blur">
                <CardContent className="p-4">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Pending Approval</p>
                  <p className="mt-1 text-2xl font-semibold">{pendingApprovals}</p>
                </CardContent>
              </Card>
              <Card className="bg-background/75 backdrop-blur">
                <CardContent className="p-4">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">DocuSign Queue</p>
                  <p className="mt-1 text-2xl font-semibold">{pendingSend}</p>
                </CardContent>
              </Card>
              <Card className="bg-background/75 backdrop-blur">
                <CardContent className="p-4">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Unresolved Names</p>
                  <p className="mt-1 text-2xl font-semibold">{unresolvedMappings + ambiguousMappings}</p>
                </CardContent>
              </Card>
              <Card className="bg-background/75 backdrop-blur">
                <CardContent className="p-4">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Periods</p>
                  <p className="mt-1 text-2xl font-semibold">{periods.length}</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04 }}
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3"
        >
          <Card>
            <CardContent className="p-4 flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 mt-0.5 text-primary" />
              <div>
                <p className="text-sm font-medium">Automatic monthly calculations</p>
                <p className="text-xs text-muted-foreground mt-0.5">Run calculations and reconciliation in one step.</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 mt-0.5 text-primary" />
              <div>
                <p className="text-sm font-medium">Carry-forward by default</p>
                <p className="text-xs text-muted-foreground mt-0.5">Only edit salary or expense deltas month-to-month.</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 mt-0.5 text-primary" />
              <div>
                <p className="text-sm font-medium">DocuSign-ready receipts</p>
                <p className="text-xs text-muted-foreground mt-0.5">Approve and send employee receipts from one queue.</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 mt-0.5 text-primary" />
              <div>
                <p className="text-sm font-medium">Workbook import fallback</p>
                <p className="text-xs text-muted-foreground mt-0.5">Use Excel only for backfill, correction, or refresh.</p>
              </div>
            </CardContent>
          </Card>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="space-y-4"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-display">Run payroll in minutes</h2>
              <p className="text-sm text-muted-foreground">Use the same sequence every month with clear control gates.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-6">
                <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Step 1</p>
                <h3 className="mt-2 font-semibold">Create or carry-forward period</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Start from last month and only update changed salaries, reimbursements, and adjustments.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Step 2</p>
                <h3 className="mt-2 font-semibold">Recalculate and review mismatches</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Compare computed outputs against imported values and resolve mapping exceptions.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-6">
                <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground">Step 3</p>
                <h3 className="mt-2 font-semibold">Approve and send receipts</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Move approved periods to DocuSign and track envelope lifecycle from one status queue.
                </p>
              </CardContent>
            </Card>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 lg:grid-cols-4 gap-4"
        >
          <Card className="lg:col-span-2">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold">A payroll workflow your accounting team can trust</h3>
              <p className="text-sm text-muted-foreground mt-2">
                Backfill imports, reconciliation, and approval logs keep payroll auditable without manual workbook upkeep.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-border p-3">
                  <p className="text-xs text-muted-foreground">Unresolved Name Queue</p>
                  <p className="text-2xl font-semibold mt-1">{unresolvedMappings + ambiguousMappings}</p>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <p className="text-xs text-muted-foreground">Periods in Review</p>
                  <p className="text-2xl font-semibold mt-1">{pendingApprovals}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Envelope Sent</p>
              <p className="text-3xl font-semibold mt-1">{dashboard.envelopeCounts.sent || 0}</p>
              <p className="text-xs text-muted-foreground mt-2">Receipts submitted to DocuSign this cycle.</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Envelope Completed</p>
              <p className="text-3xl font-semibold mt-1">{dashboard.envelopeCounts.completed || 0}</p>
              <p className="text-xs text-muted-foreground mt-2">Employees who completed signatures.</p>
            </CardContent>
          </Card>
        </motion.section>

        <section id="operations" className="space-y-6">
          <div>
            <h2 className="text-2xl font-display">Payroll Operations Console</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Create periods, import workbook data when needed, and run controlled historical backfill.
            </p>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold font-display mb-4">Create Payroll Period</h3>
                <form onSubmit={handleCreatePeriod} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="period-label">Label (optional)</Label>
                    <Input
                      id="period-label"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder="Payroll 02/2026"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="period-start">Period Start</Label>
                      <Input
                        id="period-start"
                        type="date"
                        value={periodStart}
                        onChange={(e) => setPeriodStart(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="period-end">Period End</Label>
                      <Input
                        id="period-end"
                        type="date"
                        value={periodEnd}
                        onChange={(e) => setPeriodEnd(e.target.value)}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Source Mode</Label>
                    <Select value={sourceMode} onValueChange={(value) => setSourceMode(value as SourceMode)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CARRY_FORWARD">Carry Forward</SelectItem>
                        <SelectItem value="MANUAL">Manual</SelectItem>
                        <SelectItem value="WORKBOOK">Workbook</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {sourceMode === 'CARRY_FORWARD' && (
                    <div className="space-y-1.5">
                      <Label>Base Period (optional)</Label>
                      <Select value={basePeriodId} onValueChange={setBasePeriodId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Auto-select latest prior period" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="AUTO">Auto-select latest prior period</SelectItem>
                          {periods.map((period) => (
                            <SelectItem key={period.id} value={period.id}>
                              {period.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <Button type="submit" disabled={creating} className="w-full">
                    {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                    {creating ? 'Creating...' : 'Create Period'}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold font-display mb-4">Workbook Import (Fallback Mode)</h3>
                <form onSubmit={handleWorkbookUpload} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="workbook-file">Payroll Workbook (.xlsx)</Label>
                    <Input
                      id="workbook-file"
                      type="file"
                      accept=".xlsx,.xlsm,.xls"
                      onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Target Period (optional)</Label>
                    <Select value={uploadPeriodId} onValueChange={setUploadPeriodId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Auto-resolve by workbook period columns" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AUTO">Auto-resolve by workbook period columns</SelectItem>
                        {periods.map((period) => (
                          <SelectItem key={period.id} value={period.id}>
                            {period.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button type="submit" disabled={uploading} className="w-full" variant="outline">
                    {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
                    <FileSpreadsheet className="w-4 h-4" />
                    {uploading ? 'Importing Workbook...' : 'Import Workbook'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-lg font-semibold font-display">12-Month Backfill</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Import workbook history for recent months, recalculate, and lock approved historical periods.
                  </p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                  <CircleHelp className="w-3.5 h-3.5" />
                  Slower when overwrite or audit mode is enabled
                </div>
              </div>
              <form onSubmit={handleBackfill} className="grid grid-cols-1 lg:grid-cols-4 gap-4 items-end">
                <div className="space-y-1.5 lg:col-span-2">
                  <Label htmlFor="backfill-file">Workbook File</Label>
                  <Input
                    id="backfill-file"
                    type="file"
                    accept=".xlsx,.xlsm,.xls"
                    onChange={(e) => setBackfillFile(e.target.files?.[0] || null)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="backfill-months">Months</Label>
                  <Input
                    id="backfill-months"
                    type="number"
                    min={1}
                    max={120}
                    value={backfillMonths}
                    onChange={(e) => setBackfillMonths(e.target.value)}
                  />
                </div>
                <Button type="submit" disabled={backfilling}>
                  {backfilling && <Loader2 className="w-4 h-4 animate-spin" />}
                  {backfilling ? 'Backfilling...' : 'Run Backfill'}
                </Button>

                <div className="flex flex-wrap gap-4 lg:col-span-4">
                  <label className="inline-flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={backfillUseRosterNames}
                      onCheckedChange={(checked) => setBackfillUseRosterNames(checked === true)}
                    />
                    <span>Use real employee names (dummy workbook mode)</span>
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={backfillLockApproved}
                      onCheckedChange={(checked) => setBackfillLockApproved(checked === true)}
                    />
                    <span>Auto lock approved historical periods</span>
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={backfillOverwriteLocked}
                      onCheckedChange={(checked) => setBackfillOverwriteLocked(checked === true)}
                    />
                    <span>Overwrite already locked periods</span>
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={backfillPersistRows}
                      onCheckedChange={(checked) => setBackfillPersistRows(checked === true)}
                    />
                    <span>Persist raw import rows (slower, audit mode)</span>
                  </label>
                </div>
              </form>
            </CardContent>
          </Card>
        </section>

        <Card id="periods">
          <CardContent className="p-0">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h2 className="text-lg font-semibold font-display">Payroll Periods</h2>
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/mappings">Open Mappings</Link>
              </Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Label</TableHead>
                  <TableHead>Date Range</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Inputs</TableHead>
                  <TableHead>Receipts</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {latestPeriods.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No payroll periods yet. Create one to begin automation.
                    </TableCell>
                  </TableRow>
                )}
                {latestPeriods.map((period) => (
                  <TableRow key={period.id}>
                    <TableCell className="font-medium">{period.label}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(period.periodStart).toLocaleDateString()} -{' '}
                      {new Date(period.periodEnd).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <PayrollStatusBadge status={period.status} />
                    </TableCell>
                    <TableCell>{period.sourceType}</TableCell>
                    <TableCell>{period._count.inputValues}</TableCell>
                    <TableCell>{period._count.receipts}</TableCell>
                    <TableCell>
                      <Button asChild size="sm">
                        <Link href={`${appBasePath}/payroll/${period.id}`}>Open</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h3 className="text-base font-semibold mb-2">DocuSign Queue Overview</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div className="rounded-lg border border-border p-3">
                <p className="text-muted-foreground">Created</p>
                <p className="text-xl font-semibold">{dashboard.envelopeCounts.created || 0}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-muted-foreground">Sent</p>
                <p className="text-xl font-semibold">{dashboard.envelopeCounts.sent || 0}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-muted-foreground">Completed</p>
                <p className="text-xl font-semibold">{dashboard.envelopeCounts.completed || 0}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-muted-foreground">Failed</p>
                <p className="text-xl font-semibold">{dashboard.envelopeCounts.failed || 0}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
              <ReceiptText className="w-3.5 h-3.5" />
              Status values mirror DocuSign envelope state sync output.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
