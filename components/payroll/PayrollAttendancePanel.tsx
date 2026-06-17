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

interface HolidayLite {
  id: string
  holidayDate: string
  name: string
}

const WEEKEND_DAYS = new Set<number>([0, 6]) // Sun + Sat

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'PUBLIC_HOLIDAY'
type AttendanceCellStatus = AttendanceStatus | null

const STATUS_CYCLE: AttendanceCellStatus[] = [
  'PRESENT',
  'ABSENT',
  'PUBLIC_HOLIDAY',
  null,
]

const STATUS_LABEL: Record<AttendanceStatus, string> = {
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
  const [holidays, setHolidays] = useState<HolidayLite[]>([])
  const [workingDays, setWorkingDays] = useState(0)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [replaceTiers, setReplaceTiers] = useState(false)
  const [effectiveFrom, setEffectiveFrom] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [dirtyMap, setDirtyMap] = useState<Record<string, AttendanceCellStatus>>({})
  const [holidayForm, setHolidayForm] = useState({ holidayDate: '', name: '' })
  const [savingHoliday, setSavingHoliday] = useState(false)

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
    const holidaySet = new Set(
      holidays.map((h) => new Date(h.holidayDate).toISOString().slice(0, 10))
    )
    return daysBetween(selectedPeriod.periodStart, selectedPeriod.periodEnd).filter((day) => {
      if (WEEKEND_DAYS.has(day.getUTCDay())) return false
      if (holidaySet.has(toDateKey(day))) return false
      return true
    })
  }, [selectedPeriod, holidays])

  const statusMap = useMemo(() => {
    const map = new Map<string, AttendanceCellStatus>()
    for (const entry of entries) {
      map.set(`${entry.userId}:${entry.attendanceDate.slice(0, 10)}`, entry.status)
    }
    for (const [key, status] of Object.entries(dirtyMap)) {
      map.set(key, status)
    }
    return map
  }, [entries, dirtyMap])

  const filteredEmployees = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    if (!query) return employees

    return employees.filter((employee) => {
      const haystack = `${employee.name} ${employee.role || ''}`.toLowerCase()
      return haystack.includes(query)
    })
  }, [employees, searchTerm])

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
      setHolidays(attendanceJson.holidays || [])
      setWorkingDays(attendanceJson.workingDays || 0)
      setDirtyMap({})
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load attendance')
    }
  }

  const cycleStatus = (userId: string, date: Date) => {
    const key = `${userId}:${toDateKey(date)}`
    const current = statusMap.get(key)
    const currentIndex = current === undefined ? -1 : STATUS_CYCLE.indexOf(current)
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

  const periodBounds = useMemo(() => {
    if (!selectedPeriod) return { min: '', max: '' }
    return {
      min: selectedPeriod.periodStart.slice(0, 10),
      max: selectedPeriod.periodEnd.slice(0, 10),
    }
  }, [selectedPeriod])

  const submitHoliday = async (e: FormEvent) => {
    e.preventDefault()
    if (!holidayForm.holidayDate || !holidayForm.name.trim()) {
      toast.error('Enter a date and a name for the holiday')
      return
    }
    try {
      setSavingHoliday(true)
      const res = await fetch('/api/payroll/public-holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holidayDate: holidayForm.holidayDate, name: holidayForm.name.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add holiday')
      toast.success('Public holiday added')
      setHolidayForm({ holidayDate: '', name: '' })
      if (periodId) await loadData(periodId)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add holiday')
    } finally {
      setSavingHoliday(false)
    }
  }

  const deleteHoliday = async (id: string) => {
    try {
      const res = await fetch(`/api/payroll/public-holidays?id=${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to remove holiday')
      toast.success('Public holiday removed')
      if (periodId) await loadData(periodId)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to remove holiday')
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
            <div className="space-y-1.5 min-w-[260px]">
              <Label>Search Employees</Label>
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search name or role..."
              />
            </div>
            <div className="ml-auto">
              <Button onClick={saveChanges} disabled={saving || Object.keys(dirtyMap).length === 0}>
                {saving ? 'Saving...' : `Save ${Object.keys(dirtyMap).length || ''} Changes`}
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-border [&>div]:overflow-visible">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 top-0 z-30 min-w-[200px] bg-card">Employee</TableHead>
                  {days.map((day) => (
                    <TableHead
                      key={day.toISOString()}
                      className="sticky top-0 z-20 min-w-[32px] bg-card px-1 text-center text-[11px]"
                    >
                      {day.getUTCDate()}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEmployees.map((employee) => (
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
                        <TableCell key={key} className="p-0.5 text-center">
                          <button
                            type="button"
                            onClick={() => cycleStatus(employee.id, day)}
                            className="w-7 h-7 rounded border border-border hover:bg-muted text-[11px] font-semibold"
                            title="Click to cycle P/A/H/-"
                          >
                            {status ? STATUS_LABEL[status] : '-'}
                          </button>
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))}
                {!filteredEmployees.length && (
                  <TableRow>
                    <TableCell colSpan={days.length + 1} className="text-center text-muted-foreground py-6">
                      {employees.length ? 'No employees match that search' : 'No employees found'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {employees.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Showing {filteredEmployees.length} of {employees.length} employees
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="text-lg font-semibold font-display">Public Holidays</h3>
              <p className="text-sm text-muted-foreground">
                Mark public holidays for this period. Holidays on weekdays reduce the working days used for attendance and travel proration.
              </p>
            </div>
            {selectedPeriod && (
              <span className="text-sm text-muted-foreground">
                Working days: <span className="font-medium text-foreground">{workingDays}</span>
              </span>
            )}
          </div>

          <div className="space-y-2 mb-4">
            {holidays.map((holiday) => (
              <div key={holiday.id} className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
                <div>
                  <p className="text-sm font-medium">{holiday.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(holiday.holidayDate).toLocaleDateString(undefined, { timeZone: 'UTC' })}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => deleteHoliday(holiday.id)}>
                  Remove
                </Button>
              </div>
            ))}
            {!holidays.length && (
              <p className="text-sm text-muted-foreground">No public holidays in this period.</p>
            )}
          </div>

          <form onSubmit={submitHoliday} className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input
                type="date"
                value={holidayForm.holidayDate}
                min={periodBounds.min || undefined}
                max={periodBounds.max || undefined}
                onChange={(e) => setHolidayForm({ ...holidayForm, holidayDate: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Holiday Name</Label>
              <Input
                value={holidayForm.name}
                onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })}
                placeholder="e.g. Eid Holiday"
              />
            </div>
            <Button type="submit" disabled={savingHoliday}>
              {savingHoliday ? 'Adding...' : 'Add Holiday'}
            </Button>
          </form>
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
