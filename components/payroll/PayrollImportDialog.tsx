'use client'

import { FormEvent, useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FileSpreadsheet, Loader2 } from 'lucide-react'

interface PeriodOption {
  id: string
  label: string
}

interface PayrollImportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  periods: PeriodOption[]
  onComplete: () => void
}

export function PayrollImportDialog({
  open,
  onOpenChange,
  periods,
  onComplete,
}: PayrollImportDialogProps) {
  // Import state
  const [uploading, setUploading] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadPeriodId, setUploadPeriodId] = useState('AUTO')

  // Backfill state
  const [backfilling, setBackfilling] = useState(false)
  const [backfillFile, setBackfillFile] = useState<File | null>(null)
  const [backfillMonths, setBackfillMonths] = useState('12')
  const [backfillUseRosterNames, setBackfillUseRosterNames] = useState(true)
  const [backfillLockApproved, setBackfillLockApproved] = useState(true)
  const [backfillOverwriteLocked, setBackfillOverwriteLocked] = useState(false)
  const [backfillPersistRows, setBackfillPersistRows] = useState(false)

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

      const res = await fetch('/api/payroll/import', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to import workbook')

      toast.success(
        `Workbook imported: ${data.summary?.importedInputs || 0} inputs, ${data.summary?.importedExpenses || 0} expenses`
      )
      setUploadFile(null)
      setUploadPeriodId('AUTO')
      onComplete()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to import workbook')
    } finally {
      setUploading(false)
    }
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
      const runs = backfillOverwriteLocked ? 1 : requestedMonths
      const monthsPerRun = backfillOverwriteLocked ? requestedMonths : 1

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

        const res = await fetch('/api/payroll/backfill', { method: 'POST', body: formData })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || data.details || 'Backfill failed')

        const summary = data.summary || {}
        totalProcessed += Number(summary.periodsProcessed || 0)
        totalLocked += Number(summary.periodsLocked || 0)
        totalBlocked += Number(summary.periodsBlocked || 0)

        if (!backfillOverwriteLocked && Number(summary.periodsProcessed || 0) === 0 && Number(summary.periodsBlocked || 0) === 0) {
          break
        }
      }

      toast.success(`Backfill done: ${totalProcessed} recalculated, ${totalLocked} locked, ${totalBlocked} blocked.`)
      setBackfillFile(null)
      onComplete()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Backfill failed')
    } finally {
      setBackfilling(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display">Import Payroll Data</DialogTitle>
          <DialogDescription>
            Import an Excel workbook or run a historical backfill.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="import" className="mt-2">
          <TabsList className="w-full">
            <TabsTrigger value="import" className="flex-1">Workbook Import</TabsTrigger>
            <TabsTrigger value="backfill" className="flex-1">Historical Backfill</TabsTrigger>
          </TabsList>

          <TabsContent value="import" className="mt-4">
            <form onSubmit={handleWorkbookUpload} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Payroll Workbook (.xlsx)</Label>
                <Input
                  type="file"
                  accept=".xlsx,.xlsm,.xls"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Target Period</Label>
                <Select value={uploadPeriodId} onValueChange={setUploadPeriodId}>
                  <SelectTrigger><SelectValue placeholder="Auto-resolve" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AUTO">Auto-resolve from workbook</SelectItem>
                    {periods.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={uploading} className="w-full">
                {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
                <FileSpreadsheet className="w-4 h-4" />
                {uploading ? 'Importing...' : 'Import Workbook'}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="backfill" className="mt-4">
            <form onSubmit={handleBackfill} className="space-y-4">
              <div className="space-y-1.5">
                <Label>Workbook File</Label>
                <Input
                  type="file"
                  accept=".xlsx,.xlsm,.xls"
                  onChange={(e) => setBackfillFile(e.target.files?.[0] || null)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Months</Label>
                <Input
                  type="number"
                  min={1}
                  max={120}
                  value={backfillMonths}
                  onChange={(e) => setBackfillMonths(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="inline-flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={backfillUseRosterNames}
                    onCheckedChange={(c) => setBackfillUseRosterNames(c === true)}
                  />
                  <span>Use real employee names</span>
                </label>
                <label className="inline-flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={backfillLockApproved}
                    onCheckedChange={(c) => setBackfillLockApproved(c === true)}
                  />
                  <span>Auto lock approved periods</span>
                </label>
                <label className="inline-flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={backfillOverwriteLocked}
                    onCheckedChange={(c) => setBackfillOverwriteLocked(c === true)}
                  />
                  <span>Overwrite locked periods</span>
                </label>
                <label className="inline-flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={backfillPersistRows}
                    onCheckedChange={(c) => setBackfillPersistRows(c === true)}
                  />
                  <span>Persist raw import rows (audit)</span>
                </label>
              </div>
              <Button type="submit" disabled={backfilling} className="w-full">
                {backfilling && <Loader2 className="w-4 h-4 animate-spin" />}
                {backfilling ? 'Running Backfill...' : 'Run Backfill'}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
