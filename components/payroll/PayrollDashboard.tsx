'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { PayrollStatusBadge } from '@/components/payroll/PayrollStatusBadge'
import { PayrollImportDialog } from '@/components/payroll/PayrollImportDialog'
import { PayrollAttendancePanel } from '@/components/payroll/PayrollAttendancePanel'
import { PayrollSettingsPanel } from '@/components/payroll/PayrollSettingsPanel'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  CalendarDays,
  FileSpreadsheet,
  Loader2,
  Plus,
  ReceiptText,
  Upload,
  Users,
  Wallet,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

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
type PayrollViewTab = 'runs' | 'attendance' | 'settings'

function canAccessPayrollWorkspace(role: string | null | undefined, appBasePath: WorkspaceProps['appBasePath']) {
  if (appBasePath === '/admin') return role === 'HR'
  return role === 'OA'
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function PayrollDashboard({
  appBasePath,
  badge,
  heading,
  description,
}: WorkspaceProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [periods, setPeriods] = useState<PeriodRow[]>([])
  const [dashboard, setDashboard] = useState<DashboardPayload>({
    statusCounts: {},
    mappingCounts: {},
    envelopeCounts: {},
  })
  const [importOpen, setImportOpen] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [activeTab, setActiveTab] = useState<PayrollViewTab>('runs')

  // Create period form
  const [label, setLabel] = useState('')
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [sourceMode, setSourceMode] = useState<SourceMode>('CARRY_FORWARD')
  const [basePeriodId, setBasePeriodId] = useState('AUTO')

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [periodsRes, dashboardRes] = await Promise.all([
        fetch('/api/payroll/periods'),
        fetch('/api/payroll/dashboard'),
      ])
      const periodsJson = await periodsRes.json()
      const dashboardJson = await dashboardRes.json()

      if (!periodsRes.ok) throw new Error(periodsJson.error || 'Failed to load periods')
      if (!dashboardRes.ok) throw new Error(dashboardJson.error || 'Failed to load dashboard')

      setPeriods(periodsJson.periods || [])
      setDashboard({
        statusCounts: dashboardJson.statusCounts || {},
        mappingCounts: dashboardJson.mappingCounts || {},
        envelopeCounts: dashboardJson.envelopeCounts || {},
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load payroll')
    } finally {
      setLoading(false)
    }
  }

  const handleCreatePeriod = async (event: FormEvent) => {
    event.preventDefault()
    setCreating(true)
    try {
      if (!periodStart || !periodEnd) throw new Error('Start and end date required')

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
      if (!res.ok) throw new Error(data.error || 'Failed to create period')

      toast.success('Payroll period created')
      setLabel('')
      setBasePeriodId('AUTO')
      setShowCreateForm(false)
      await loadData()

      // Navigate to the new period
      if (data.period?.id) {
        router.push(`${appBasePath}/payroll/${data.period.id}`)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create period')
    } finally {
      setCreating(false)
    }
  }

  const pendingApprovals = dashboard.statusCounts.CALCULATED || 0
  const totalPeriods = periods.length
  const latestPeriods = useMemo(() => periods.slice(0, 10), [periods])
  const canEditMaster = appBasePath === '/admin'

  // Compute total net from the most recent period
  const latestPeriod = periods[0]

  if (loading) return <LoadingScreen message="Loading payroll..." />

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-6">
        {/* Hero Section */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-[28px] border border-border bg-gradient-to-br from-primary/20 via-background to-secondary/10"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.16),transparent_48%)]" />
          <div className="relative p-6 sm:p-8 lg:p-10">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{badge}</p>
                <h1 className="text-3xl sm:text-4xl font-display leading-tight">{heading}</h1>
                <p className="text-muted-foreground max-w-xl">{description}</p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button size="lg" onClick={() => setShowCreateForm(true)}>
                  <Plus className="w-4 h-4" />
                  Run Payroll
                </Button>
                <Button size="lg" variant="outline" onClick={() => setImportOpen(true)}>
                  <Upload className="w-4 h-4" />
                  Import
                </Button>
              </div>
            </div>
          </div>
        </motion.section>

        {/* Metric Cards */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-3"
        >
          <Card className="bg-card/80 backdrop-blur">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <CalendarDays className="w-3.5 h-3.5" />
                <p className="text-xs uppercase tracking-wider">Periods</p>
              </div>
              <p className="text-2xl font-semibold">{totalPeriods}</p>
            </CardContent>
          </Card>
          <Card className="bg-card/80 backdrop-blur">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <ReceiptText className="w-3.5 h-3.5" />
                <p className="text-xs uppercase tracking-wider">Pending Approval</p>
              </div>
              <p className="text-2xl font-semibold">{pendingApprovals}</p>
            </CardContent>
          </Card>
          <Card className="bg-card/80 backdrop-blur">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <p className="text-xs uppercase tracking-wider">DocuSign Sent</p>
              </div>
              <p className="text-2xl font-semibold">{dashboard.envelopeCounts.sent || 0}</p>
            </CardContent>
          </Card>
          <Card className="bg-card/80 backdrop-blur">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Users className="w-3.5 h-3.5" />
                <p className="text-xs uppercase tracking-wider">Unresolved Names</p>
              </div>
              <p className="text-2xl font-semibold">
                {(dashboard.mappingCounts.UNRESOLVED || 0) + (dashboard.mappingCounts.AMBIGUOUS || 0)}
              </p>
            </CardContent>
          </Card>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 }}
        >
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as PayrollViewTab)}>
            <TabsList className="grid grid-cols-3 w-full max-w-lg">
              <TabsTrigger value="runs">Period Runs</TabsTrigger>
              <TabsTrigger value="attendance">Attendance</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>
          </Tabs>
        </motion.section>

        {activeTab === 'runs' && showCreateForm && (
          <motion.section
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold font-display">Create Payroll Period</h3>
                  <Button variant="ghost" size="sm" onClick={() => setShowCreateForm(false)}>
                    Cancel
                  </Button>
                </div>
                <form onSubmit={handleCreatePeriod} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
                  <div className="space-y-1.5">
                    <Label>Label</Label>
                    <Input
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder="Payroll 02/2026"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Start Date</Label>
                    <Input
                      type="date"
                      value={periodStart}
                      onChange={(e) => setPeriodStart(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>End Date</Label>
                    <Input
                      type="date"
                      value={periodEnd}
                      onChange={(e) => setPeriodEnd(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Source</Label>
                    <Select value={sourceMode} onValueChange={(v) => setSourceMode(v as SourceMode)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CARRY_FORWARD">Carry Forward</SelectItem>
                        <SelectItem value="MANUAL">Manual</SelectItem>
                        <SelectItem value="WORKBOOK">Workbook</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {sourceMode === 'CARRY_FORWARD' && (
                    <div className="space-y-1.5 md:col-span-2">
                      <Label>Base Period</Label>
                      <Select value={basePeriodId} onValueChange={setBasePeriodId}>
                        <SelectTrigger><SelectValue placeholder="Auto-select latest" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="AUTO">Auto-select latest</SelectItem>
                          {periods.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <Button type="submit" disabled={creating} className="md:col-span-2 lg:col-span-1">
                    {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                    {creating ? 'Creating...' : 'Create & Open'}
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </form>
              </CardContent>
            </Card>
          </motion.section>
        )}

        {activeTab === 'runs' && (
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
          >
            <Card>
              <CardContent className="p-0">
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <h2 className="text-lg font-semibold font-display">Recent Payroll Periods</h2>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/admin/mappings">Identity Mappings</Link>
                  </Button>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Period</TableHead>
                      <TableHead>Date Range</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead className="text-right">Inputs</TableHead>
                      <TableHead className="text-right">Receipts</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {latestPeriods.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                          No payroll periods yet. Click "Run Payroll" to start.
                        </TableCell>
                      </TableRow>
                    )}
                    {latestPeriods.map((period) => (
                      <TableRow key={period.id} className="group">
                        <TableCell className="font-medium">{period.label}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(period.periodStart).toLocaleDateString()} - {new Date(period.periodEnd).toLocaleDateString()}
                        </TableCell>
                        <TableCell><PayrollStatusBadge status={period.status} /></TableCell>
                        <TableCell className="text-sm">{period.sourceType}</TableCell>
                        <TableCell className="text-right text-sm">{period._count.inputValues}</TableCell>
                        <TableCell className="text-right text-sm">{period._count.receipts}</TableCell>
                        <TableCell>
                          <Button size="sm" asChild>
                            <Link href={`${appBasePath}/payroll/${period.id}`}>
                              Open
                              <ArrowRight className="w-3.5 h-3.5" />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </motion.section>
        )}

        {activeTab === 'attendance' && <PayrollAttendancePanel periods={periods} />}
        {activeTab === 'settings' && <PayrollSettingsPanel canEdit={canEditMaster} />}

      {/* Import Dialog */}
      <PayrollImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        periods={periods.map((p) => ({ id: p.id, label: p.label }))}
        onComplete={loadData}
      />
    </div>
  )
}
