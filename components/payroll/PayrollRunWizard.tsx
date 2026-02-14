'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { PayrollStatusBadge } from '@/components/payroll/PayrollStatusBadge'
import { PayrollEmployeeGrid } from '@/components/payroll/PayrollEmployeeGrid'
import { PayrollEmployeeDetail } from '@/components/payroll/PayrollEmployeeDetail'
import {
  Calculator,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileSignature,
  Loader2,
  RefreshCcw,
  Users,
  Wallet,
  CalendarDays,
  AlertTriangle,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type WizardStep = 0 | 1 | 2 | 3 | 4
type PendingAction = 'recalculate' | 'approve' | 'send' | 'sync' | 'none'

interface PreviousData {
  previousInputs: Record<string, Record<string, number>>
  previousComputed: Record<string, Record<string, number>>
  previousPeriod?: { id: string; label: string } | null
}

interface WizardProps {
  appBasePath: '/oa' | '/admin'
  periodId: string
  badge: string
  period: any
  user: any
  onReload: () => Promise<void>
  onLogout: () => void
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STEPS = [
  { label: 'Input & Review', description: 'Review carry-forward data and make changes' },
  { label: 'Calculate', description: 'Run calculation and compare' },
  { label: 'Reconciliation', description: 'Review mismatches' },
  { label: 'Approve', description: 'Sign off on the pay run' },
  { label: 'Send', description: 'Dispatch receipts via HelloSign' },
] as const

function num(v: unknown) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function money(v: number) {
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

/* ------------------------------------------------------------------ */
/*  Step Header                                                        */
/* ------------------------------------------------------------------ */

function StepHeader({
  currentStep,
  onStepClick,
  periodStatus,
}: {
  currentStep: WizardStep
  onStepClick: (step: WizardStep) => void
  periodStatus: string
}) {
  return (
    <div className="border-b border-border bg-card">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-muted-foreground">
            Step {currentStep + 1} of {STEPS.length}
          </p>
          <PayrollStatusBadge status={periodStatus} />
        </div>
        <div className="flex items-center gap-1">
          {STEPS.map((step, index) => {
            const isActive = index === currentStep
            const isCompleted = index < currentStep
            return (
              <button
                key={step.label}
                type="button"
                onClick={() => onStepClick(index as WizardStep)}
                className={`flex-1 rounded-lg px-3 py-2 text-left transition-all ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : isCompleted
                      ? 'bg-primary/10 text-primary hover:bg-primary/15'
                      : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                }`}
              >
                <p className="text-xs font-medium">{step.label}</p>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Wizard Component                                                   */
/* ------------------------------------------------------------------ */

export function PayrollRunWizard({
  appBasePath,
  periodId,
  badge,
  period,
  user,
  onReload,
  onLogout,
}: WizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>(0)
  const [pendingAction, setPendingAction] = useState<PendingAction>('none')
  const [approvalComment, setApprovalComment] = useState('')
  const [previousData, setPreviousData] = useState<PreviousData | null>(null)
  const [detailEmployee, setDetailEmployee] = useState<string | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  // Load comparison data
  useEffect(() => {
    fetch(`/api/payroll/periods/${periodId}/comparison`)
      .then((res) => res.json())
      .then((data) => {
        if (data.previousInputs || data.previousComputed) {
          setPreviousData(data)
        }
      })
      .catch(() => {})
  }, [periodId])

  const handleStepClick = useCallback((step: WizardStep) => {
    // Free navigation with warnings
    if (step === 3 && period.status === 'DRAFT') {
      toast.warning('Run calculation before approving')
    }
    if (step === 4 && period.status !== 'APPROVED' && period.status !== 'SENDING' && period.status !== 'SENT') {
      toast.warning('Approve the period before sending receipts')
    }
    setCurrentStep(step)
  }, [period?.status])

  const runAction = useCallback(async (action: Exclude<PendingAction, 'none'>) => {
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
      if (!res.ok) throw new Error(data.error || `Failed to ${action}`)
      if (action === 'approve') setApprovalComment('')
      toast.success(`Payroll ${action} completed`)
      await onReload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Failed to ${action}`)
    } finally {
      setPendingAction('none')
    }
  }, [periodId, approvalComment, onReload])

  const mismatches = useMemo(
    () => (period?.summaryJson as any)?.mismatches || [],
    [period],
  )

  const gridRows = period?.inputValues || []
  const computedValues = period?.computedValues || []

  // Compute totals for the header
  const totalNet = useMemo(() => {
    let sum = 0
    for (const cv of computedValues) {
      if (cv.metricKey === 'NET_SALARY') sum += num(cv.amount)
    }
    return sum
  }, [computedValues])

  const employeeCount = useMemo(() => {
    const names = new Set<string>()
    for (const iv of gridRows) names.add(iv.payrollName)
    return names.size
  }, [gridRows])

  const handleEmployeeClick = useCallback((payrollName: string) => {
    setDetailEmployee(payrollName)
    setDetailOpen(true)
  }, [])

  return (
    <div className="min-h-screen bg-background">
      {/* Step header */}
      <StepHeader
        currentStep={currentStep}
        onStepClick={handleStepClick}
        periodStatus={period.status}
      />

      {/* Period info bar */}
      <div className="border-b border-border bg-card/50">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">{badge}</p>
              <h1 className="text-xl font-semibold font-display">{period.label}</h1>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <CalendarDays className="w-3.5 h-3.5" />
                {new Date(period.periodStart).toLocaleDateString()} - {new Date(period.periodEnd).toLocaleDateString()}
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Users className="w-3.5 h-3.5" />
                {employeeCount} employees
              </div>
              <div className="flex items-center gap-1.5 font-semibold">
                <Wallet className="w-3.5 h-3.5" />
                PKR {money(totalNet)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 py-6">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Step 0: Input & Review */}
          {currentStep === 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold font-display">Review Employee Pay</h2>
                  <p className="text-sm text-muted-foreground">
                    Data carried forward from last period. Click any cell to edit.
                  </p>
                </div>
              </div>
              <PayrollEmployeeGrid
                periodId={periodId}
                inputValues={gridRows}
                computedValues={computedValues}
                previousData={previousData}
                status={period.status}
                onEmployeeClick={handleEmployeeClick}
                onDataChange={onReload}
              />
            </div>
          )}

          {/* Step 1: Calculate & Compare */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold font-display">Calculate & Compare</h2>
                  <p className="text-sm text-muted-foreground">
                    Run the payroll engine to compute taxes, deductions, and net pay.
                  </p>
                </div>
                <Button
                  onClick={() => runAction('recalculate')}
                  disabled={pendingAction !== 'none'}
                  size="lg"
                >
                  {pendingAction === 'recalculate' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Calculator className="w-4 h-4" />
                  )}
                  Run Calculation
                </Button>
              </div>

              {period.status !== 'DRAFT' && (
                <Card>
                  <CardContent className="p-6">
                    <h3 className="text-base font-semibold mb-4">Calculation Summary</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="rounded-lg border border-border p-3">
                        <p className="text-xs text-muted-foreground">Employees</p>
                        <p className="text-xl font-semibold mt-1">{employeeCount}</p>
                      </div>
                      <div className="rounded-lg border border-border p-3">
                        <p className="text-xs text-muted-foreground">Total Net Pay</p>
                        <p className="text-xl font-semibold mt-1">PKR {money(totalNet)}</p>
                      </div>
                      <div className="rounded-lg border border-border p-3">
                        <p className="text-xs text-muted-foreground">Mismatches</p>
                        <p className="text-xl font-semibold mt-1">{mismatches.length}</p>
                      </div>
                      <div className="rounded-lg border border-border p-3">
                        <p className="text-xs text-muted-foreground">Receipts</p>
                        <p className="text-xl font-semibold mt-1">{period.receipts?.length || 0}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Show the grid with comparison */}
              <PayrollEmployeeGrid
                periodId={periodId}
                inputValues={gridRows}
                computedValues={computedValues}
                previousData={previousData}
                status={period.status}
                onEmployeeClick={handleEmployeeClick}
                onDataChange={onReload}
              />
            </div>
          )}

          {/* Step 2: Reconciliation */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold font-display">Reconciliation</h2>
                <p className="text-sm text-muted-foreground">
                  Review discrepancies between computed net salary and recorded payments.
                </p>
              </div>

              {mismatches.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                    <p className="text-base font-medium">No mismatches found</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      All computed values are within tolerance. You can proceed to approval.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <div className="p-4 border-b border-border flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                      <span className="text-sm font-medium">{mismatches.length} mismatch{mismatches.length !== 1 ? 'es' : ''} found</span>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead>Employee</TableHead>
                          <TableHead>Check</TableHead>
                          <TableHead className="text-right">Expected</TableHead>
                          <TableHead className="text-right">Actual</TableHead>
                          <TableHead className="text-right">Delta</TableHead>
                          <TableHead>Severity</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mismatches.map((item: any, idx: number) => (
                          <TableRow key={`${item.payrollName}-${idx}`}>
                            <TableCell className="font-medium">{item.payrollName}</TableCell>
                            <TableCell className="text-sm">{item.check}</TableCell>
                            <TableCell className="text-right text-sm">{money(num(item.expected))}</TableCell>
                            <TableCell className="text-right text-sm">{money(num(item.actual))}</TableCell>
                            <TableCell className="text-right text-sm font-medium">
                              <span className={num(item.delta) > 0 ? 'text-emerald-600' : 'text-red-500'}>
                                {num(item.delta) > 0 ? '+' : ''}{money(num(item.delta))}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                item.severity === 'critical'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-amber-100 text-amber-700'
                              }`}>
                                {item.severity}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Step 3: Approve */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold font-display">Approve Pay Run</h2>
                <p className="text-sm text-muted-foreground">
                  Review the summary and approve to proceed with sending receipts.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardContent className="p-6 space-y-4">
                    <h3 className="font-semibold">Approval</h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between rounded-lg border border-border p-3">
                        <span className="text-sm text-muted-foreground">Status</span>
                        <PayrollStatusBadge status={period.status} />
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-border p-3">
                        <span className="text-sm text-muted-foreground">Employees</span>
                        <span className="text-sm font-medium">{employeeCount}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-border p-3">
                        <span className="text-sm text-muted-foreground">Total Net Pay</span>
                        <span className="text-sm font-medium">PKR {money(totalNet)}</span>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-border p-3">
                        <span className="text-sm text-muted-foreground">Mismatches</span>
                        <span className="text-sm font-medium">{mismatches.length}</span>
                      </div>
                    </div>
                    <Separator />
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Approval Comment (optional)</label>
                      <Textarea
                        value={approvalComment}
                        onChange={(e) => setApprovalComment(e.target.value)}
                        placeholder="Add a note for the approval log..."
                        rows={3}
                      />
                    </div>
                    <Button
                      onClick={() => runAction('approve')}
                      disabled={pendingAction !== 'none'}
                      className="w-full"
                      size="lg"
                    >
                      {pendingAction === 'approve' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4" />
                      )}
                      Approve Period
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-0">
                    <div className="p-4 border-b border-border">
                      <h3 className="font-semibold">Approval History</h3>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead>Actor</TableHead>
                          <TableHead>Transition</TableHead>
                          <TableHead>Comment</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(period.approvalEvents || []).map((event: any) => (
                          <TableRow key={event.id}>
                            <TableCell className="text-sm">{event.actor?.name || 'Unknown'}</TableCell>
                            <TableCell className="text-sm">
                              {event.fromStatus || '-'} &rarr; {event.toStatus}
                            </TableCell>
                            <TableCell className="text-sm max-w-[200px] truncate">{event.comment || '-'}</TableCell>
                            <TableCell className="text-sm">{new Date(event.createdAt).toLocaleString()}</TableCell>
                          </TableRow>
                        ))}
                        {(!period.approvalEvents || period.approvalEvents.length === 0) && (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-sm">
                              No approval events yet.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* Step 4: Send */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold font-display">Send Receipts</h2>
                <p className="text-sm text-muted-foreground">
                  Generate PDF receipts and send via HelloSign for e-signature.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-1">
                  <CardContent className="p-6 space-y-4">
                    <h3 className="font-semibold">Actions</h3>
                    <Button
                      onClick={() => runAction('send')}
                      disabled={pendingAction !== 'none'}
                      className="w-full"
                      size="lg"
                    >
                      {pendingAction === 'send' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <FileSignature className="w-4 h-4" />
                      )}
                      Send Receipts via HelloSign
                    </Button>
                    <Button
                      onClick={() => runAction('sync')}
                      disabled={pendingAction !== 'none'}
                      variant="outline"
                      className="w-full"
                    >
                      {pendingAction === 'sync' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <RefreshCcw className="w-4 h-4" />
                      )}
                      Sync Signing Status
                    </Button>
                  </CardContent>
                </Card>

                <Card className="lg:col-span-2">
                  <CardContent className="p-0">
                    <div className="p-4 border-b border-border">
                      <h3 className="font-semibold">Receipts ({period.receipts?.length || 0})</h3>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead>Employee</TableHead>
                          <TableHead>Recipient</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Signature</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(period.receipts || []).map((receipt: any) => {
                          const envelope = receipt.envelopes?.[0]
                          return (
                            <TableRow
                              key={receipt.id}
                              className="cursor-pointer hover:bg-muted/30"
                              onClick={() => handleEmployeeClick(receipt.payrollName)}
                            >
                              <TableCell className="font-medium text-sm">{receipt.payrollName}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {receipt.user?.name || 'Unmapped'}
                              </TableCell>
                              <TableCell><PayrollStatusBadge status={receipt.status} /></TableCell>
                              <TableCell>
                                {envelope ? (
                                  <PayrollStatusBadge status={envelope.status} />
                                ) : (
                                  <span className="text-xs text-muted-foreground">-</span>
                                )}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                        {(!period.receipts || period.receipts.length === 0) && (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-8 text-muted-foreground text-sm">
                              No receipts yet. Run calculation first.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </motion.div>

        {/* Navigation footer */}
        <div className="flex items-center justify-between mt-8 pt-4 border-t border-border">
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild>
              <Link href={`${appBasePath}/payroll`}>
                <ChevronLeft className="w-4 h-4" />
                Payroll History
              </Link>
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {currentStep > 0 && (
              <Button variant="outline" onClick={() => setCurrentStep((s) => (s - 1) as WizardStep)}>
                <ChevronLeft className="w-4 h-4" />
                Back
              </Button>
            )}
            {currentStep < 4 && (
              <Button onClick={() => setCurrentStep((s) => (s + 1) as WizardStep)}>
                {currentStep === 0 ? 'Preview Payroll' : 'Next'}
                <ChevronRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </main>

      {/* Employee detail slide-over */}
      <PayrollEmployeeDetail
        open={detailOpen}
        onOpenChange={setDetailOpen}
        payrollName={detailEmployee}
        periodLabel={period.label}
        receipts={period.receipts || []}
      />
    </div>
  )
}
