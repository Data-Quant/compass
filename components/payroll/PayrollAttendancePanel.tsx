'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface PeriodLite {
  id: string
  label: string
  status: string
  periodStart: string
  periodEnd: string
}

interface Props {
  periods: PeriodLite[]
}

interface EmployeeRow {
  id: string
  name: string
  role: string
}

interface AttendanceEntry {
  id: string
  userId: string
  attendanceDate: string
  status: 'PRESENT' | 'ABSENT' | 'PUBLIC_HOLIDAY'
}

const STATUS_CYCLE: Array<'PRESENT' | 'ABSENT' | 'PUBLIC_HOLIDAY'> = [
  'PRESENT',
  'ABSENT',
  'PUBLIC_HOLIDAY',
]

const STATUS_LABEL: Record<'PRESENT' | 'ABSENT' | 'PUBLIC_HOLIDAY', string> = {
  PRESENT: 'P',
  ABSENT: 'A',
  PUBLIC_HOLIDAY: 'H',
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function daysBetween(startIso: string, endIso: string) {
  const start = new Date(startIso)
  const end = new Date(endIso)
  const out: Date[] = []
  let current = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()))
  const max = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()))
  while (current.getTime() <= max.getTime()) {
    out.push(current)
    current = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate() + 1))
  }
  return out
}

export function PayrollAttendancePanel({ periods }: Props) {
  const [periodId, setPeriodId] = useState('')
  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [entries, setEntries] = useState<AttendanceEntry[]>([])
  const [workingDays, setWorkingDays] = useState(0)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [replaceTiers, setReplaceTiers] = useState(false)
  const [effectiveFrom, setEffectiveFrom] = useState('')
  const [dirtyMap, setDirtyMap] = useState<Record<string, 'PRESENT' | 'ABSENT' | 'PUBLIC_HOLIDAY'>>({})

  useEffect(() => {
    if (periods.length > 0 && !periodId) {
      setPeriodId(periods[0].id)
    }
  }, [periods, periodId])

  useEffect(() => {
    if (!periodId) return
    loadData(periodId)
  }, [periodId])

  const selectedPeriod = useMemo(
    () => periods.find((period) => period.id === periodId) || null,
    [periods, periodId]
  )

  const days = useMemo(() => {
    if (!selectedPeriod) return []
    return daysBetween(selectedPeriod.periodStart, selectedPeriod.periodEnd)
  }, [selectedPeriod])

  const statusMap = useMemo(() => {
    const map = new Map<string, 'PRESENT' | 'ABSENT' | 'PUBLIC_HOLIDAY'>()
    for (const entry of entries) {
      map.set(`${entry.userId}:${entry.attendanceDate.slice(0, 10)}`, entry.status)
    }
    for (const [key, status] of Object.entries(dirtyMap)) {
      map.set(key, status)
    }
    return map
  }, [entries, dirtyMap])

  const loadData = async (nextPeriodId: string) => {
    try {
      const [employeesRes, attendanceRes] = await Promise.all([
        fetch('/api/payroll/employees'),
        fetch(`/api/payroll/attendance?periodId=${nextPeriodId}`),
      ])
      const employeesJson = await employeesRes.json()
      const attendanceJson = await attendanceRes.json()
      if (!employeesRes.ok) throw new Error(employeesJson.error || 'Failed to load employees')
      if (!attendanceRes.ok) throw new Error(attendanceJson.error || 'Failed to load attendance')

      setEmployees((employeesJson.employees || []).map((row: any) => ({
        id: row.id,
        name: row.name,
        role: row.role,
      })))
      setEntries(attendanceJson.entries || [])
      setWorkingDays(attendanceJson.workingDays || 0)
      setDirtyMap({})
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load attendance')
    }
  }

  const cycleStatus = (userId: string, date: Date) => {
    const key = `${userId}:${toDateKey(date)}`
    const current = statusMap.get(key)
    const currentIndex = current ? STATUS_CYCLE.indexOf(current) : -1
    const next = STATUS_CYCLE[(currentIndex + 1) % STATUS_CYCLE.length]
    setDirtyMap((prev) => ({ ...prev, [key]: next }))
  }

  const saveChanges = async () => {
    if (!periodId) return
    const updates = Object.entries(dirtyMap).map(([key, status]) => {
      const [userId, attendanceDate] = key.split(':')
      return { userId, attendanceDate, status }
    })
    if (updates.length === 0) {
      toast.message('No attendance changes to save')
      return
    }

    try {
      setSaving(true)
      const res = await fetch('/api/payroll/attendance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodId, updates }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save attendance')
      toast.success(`Saved ${updates.length} attendance changes`)
      await loadData(periodId)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save attendance')
    } finally {
      setSaving(false)
    }
  }

  const submitImport = async (e: FormEvent) => {
    e.preventDefault()
    if (!file) {
      toast.error('Please choose a CSV file')
      return
    }

    try {
      setImporting(true)
      const formData = new FormData()
      formData.append('file', file)
      if (periodId) formData.append('periodId', periodId)
      if (effectiveFrom) formData.append('effectiveFrom', effectiveFrom)
      formData.append('replaceTiers', String(replaceTiers))
      const res = await fetch('/api/payroll/attendance/import', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')
      toast.success('Attendance CSV imported')
      if (periodId) await loadData(periodId)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to import attendance')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div className="space-y-1.5 min-w-[220px]">
              <Label>Payroll Period</Label>
              <Select value={periodId || '__none__'} onValueChange={(v) => setPeriodId(v === '__none__' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select period</SelectItem>
                  {periods.map((period) => (
                    <SelectItem key={period.id} value={period.id}>
                      {period.label} ({period.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Working Days (auto)</Label>
              <Input value={String(workingDays)} readOnly />
            </div>
            <div className="ml-auto">
              <Button onClick={saveChanges} disabled={saving || Object.keys(dirtyMap).length === 0}>
                {saving ? 'Saving...' : `Save ${Object.keys(dirtyMap).length || ''} Changes`}
              </Button>
            </div>
          </div>

          <div className="overflow-auto border border-border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-card z-10 min-w-[200px]">Employee</TableHead>
                  {days.map((day) => (
                    <TableHead key={day.toISOString()} className="text-center min-w-[48px]">
                      {day.getUTCDate()}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((employee) => (
                  <TableRow key={employee.id}>
                    <TableCell className="sticky left-0 bg-card z-10">
                      <div>
                        <p className="text-sm font-medium">{employee.name}</p>
                        <p className="text-xs text-muted-foreground">{employee.role}</p>
                      </div>
                    </TableCell>
                    {days.map((day) => {
                      const key = `${employee.id}:${toDateKey(day)}`
                      const status = statusMap.get(key)
                      return (
                        <TableCell key={key} className="p-1 text-center">
                          <button
                            type="button"
                            onClick={() => cycleStatus(employee.id, day)}
                            className="w-8 h-8 rounded border border-border hover:bg-muted text-xs font-semibold"
                            title="Click to cycle P/A/H"
                          >
                            {status ? STATUS_LABEL[status] : '-'}
                          </button>
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))}
                {!employees.length && (
                  <TableRow>
                    <TableCell colSpan={days.length + 1} className="text-center text-muted-foreground py-6">
                      No employees found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold font-display mb-3">Import Attendance + Travel Rates CSV</h3>
          <form onSubmit={submitImport} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div className="space-y-1.5 md:col-span-2">
              <Label>CSV File</Label>
              <Input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] || null)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Travel Tier Effective From</Label>
              <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Replace Existing Tiers</Label>
              <Select value={replaceTiers ? 'YES' : 'NO'} onValueChange={(v) => setReplaceTiers(v === 'YES')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NO">No</SelectItem>
                  <SelectItem value="YES">Yes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-4 flex justify-end">
              <Button type="submit" disabled={importing}>
                {importing ? 'Importing...' : 'Import Attendance CSV'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

