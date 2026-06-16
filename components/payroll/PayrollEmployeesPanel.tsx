'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Search, Pencil, AlertCircle } from 'lucide-react'

interface EmployeeRow {
  id: string
  name: string
  role: string
  payrollProfile: {
    designation: string | null
    department: { name: string } | null
    employmentType: { name: string } | null
    distanceKm?: number | null
    transportMode?: string | null
  } | null
}

interface NamedOption {
  id: string
  name: string
  isActive: boolean
}

interface ProfileForm {
  designation: string
  payrollDepartmentId: string
  employmentTypeId: string
  joiningDate: string
  exitDate: string
  distanceKm: string
  transportMode: string
  isPayrollActive: boolean
}

const TRANSPORT_LABEL: Record<string, string> = {
  CAR: 'Car',
  BIKE: 'Bike',
  PUBLIC_TRANSPORT: 'Public Transport',
}

const EMPTY_FORM: ProfileForm = {
  designation: '',
  payrollDepartmentId: '',
  employmentTypeId: '',
  joiningDate: '',
  exitDate: '',
  distanceKm: '',
  transportMode: '',
  isPayrollActive: true,
}

function toDateInput(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

export function PayrollEmployeesPanel() {
  const [employees, setEmployees] = useState<EmployeeRow[]>([])
  const [departments, setDepartments] = useState<NamedOption[]>([])
  const [employmentTypes, setEmploymentTypes] = useState<NamedOption[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [editing, setEditing] = useState<EmployeeRow | null>(null)
  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM)
  const [loadingForm, setLoadingForm] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadAll()
  }, [])

  const loadAll = async () => {
    try {
      const [empRes, deptRes, typeRes] = await Promise.all([
        fetch('/api/payroll/employees?includeOperational=true'),
        fetch('/api/payroll/departments'),
        fetch('/api/payroll/employment-types'),
      ])
      const [empJson, deptJson, typeJson] = await Promise.all([empRes.json(), deptRes.json(), typeRes.json()])
      if (!empRes.ok) throw new Error(empJson.error || 'Failed to load employees')
      setEmployees(empJson.employees || [])
      setDepartments((deptJson.departments || []).filter((d: NamedOption) => d.isActive))
      setEmploymentTypes((typeJson.employmentTypes || []).filter((t: NamedOption) => t.isActive))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load employees')
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return employees
    return employees.filter((e) =>
      `${e.name} ${e.role} ${e.payrollProfile?.department?.name || ''}`.toLowerCase().includes(q)
    )
  }, [employees, search])

  const openEditor = async (employee: EmployeeRow) => {
    setEditing(employee)
    setForm(EMPTY_FORM)
    setLoadingForm(true)
    try {
      const res = await fetch(`/api/payroll/employees/${employee.id}/profile`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load profile')
      const p = data.profile
      setForm({
        designation: p.designation || '',
        payrollDepartmentId: p.payrollDepartmentId || '',
        employmentTypeId: p.employmentTypeId || '',
        joiningDate: toDateInput(p.joiningDate),
        exitDate: toDateInput(p.exitDate),
        distanceKm: p.distanceKm != null ? String(p.distanceKm) : '',
        transportMode: p.transportMode || '',
        isPayrollActive: p.isPayrollActive ?? true,
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load profile')
      setEditing(null)
    } finally {
      setLoadingForm(false)
    }
  }

  const handleSave = async () => {
    if (!editing) return
    setSaving(true)
    try {
      const res = await fetch(`/api/payroll/employees/${editing.id}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          designation: form.designation.trim() || null,
          payrollDepartmentId: form.payrollDepartmentId || null,
          employmentTypeId: form.employmentTypeId || null,
          joiningDate: form.joiningDate || null,
          exitDate: form.exitDate || null,
          distanceKm: form.distanceKm.trim() === '' ? null : Number(form.distanceKm),
          transportMode: form.transportMode || null,
          isPayrollActive: form.isPayrollActive,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save')
      toast.success(`Updated ${editing.name}`)
      setEditing(null)
      await loadAll()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  const travelIncomplete = (e: EmployeeRow) =>
    !e.payrollProfile?.transportMode || e.payrollProfile?.distanceKm == null

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-semibold font-display">Employee Payroll Profiles</h3>
            <p className="text-sm text-muted-foreground">
              Edit operational payroll details. Salary, bank, and CNIC details remain with HR.
            </p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search employees..."
              className="pl-8"
            />
          </div>
        </div>

        <div className="rounded-lg border border-border [&>div]:max-h-[60vh] [&>div]:overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[200px]">Employee</TableHead>
                <TableHead>Department</TableHead>
                <TableHead className="text-right">Distance</TableHead>
                <TableHead>Transport</TableHead>
                <TableHead className="w-20 text-right">Edit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Loading employees...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    {employees.length ? 'No employees match that search' : 'No employees found'}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <p className="text-sm font-medium">{e.name}</p>
                      <p className="text-xs text-muted-foreground">{e.payrollProfile?.designation || e.role}</p>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {e.payrollProfile?.department?.name || '—'}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {e.payrollProfile?.distanceKm != null ? `${e.payrollProfile.distanceKm} km` : '—'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {e.payrollProfile?.transportMode ? (
                        TRANSPORT_LABEL[e.payrollProfile.transportMode] || e.payrollProfile.transportMode
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-600">
                          <AlertCircle className="w-3.5 h-3.5" /> Not set
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditor(e)}
                        className={travelIncomplete(e) ? 'text-amber-600' : ''}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {!loading && employees.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Showing {filtered.length} of {employees.length} employees. Highlighted rows are missing a transport mode or distance needed for travel allowance.
          </p>
        )}
      </CardContent>

      <Modal
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${editing.name}` : 'Edit Employee'}
      >
        {loadingForm ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading profile...</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label className="mb-1">Designation</Label>
              <Input
                value={form.designation}
                onChange={(e) => setForm({ ...form, designation: e.target.value })}
                placeholder="Role / Designation"
              />
            </div>
            <div>
              <Label className="mb-1">Payroll Department</Label>
              <Select
                value={form.payrollDepartmentId || '__none__'}
                onValueChange={(v) => setForm({ ...form, payrollDepartmentId: v === '__none__' ? '' : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1">Employment Type</Label>
              <Select
                value={form.employmentTypeId || '__none__'}
                onValueChange={(v) => setForm({ ...form, employmentTypeId: v === '__none__' ? '' : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {employmentTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1">Joining Date</Label>
              <Input
                type="date"
                value={form.joiningDate}
                onChange={(e) => setForm({ ...form, joiningDate: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-1">Exit Date</Label>
              <Input
                type="date"
                value={form.exitDate}
                onChange={(e) => setForm({ ...form, exitDate: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-1">Distance from Office (KM)</Label>
              <Input
                type="number"
                min={0}
                value={form.distanceKm}
                onChange={(e) => setForm({ ...form, distanceKm: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-1">Transport Mode</Label>
              <Select
                value={form.transportMode || '__none__'}
                onValueChange={(v) => setForm({ ...form, transportMode: v === '__none__' ? '' : v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select transport mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  <SelectItem value="CAR">Car</SelectItem>
                  <SelectItem value="BIKE">Bike</SelectItem>
                  <SelectItem value="PUBLIC_TRANSPORT">Public Transport</SelectItem>
                </SelectContent>
              </Select>
              {form.distanceKm.trim() !== '' && !form.transportMode && (
                <p className="mt-1 text-xs text-amber-600">
                  Set a transport mode — travel allowance needs both distance and mode (Bike and Car/Public use different rates).
                </p>
              )}
            </div>
            <div className="sm:col-span-2 flex items-center gap-2">
              <input
                id="payroll-active"
                type="checkbox"
                checked={form.isPayrollActive}
                onChange={(e) => setForm({ ...form, isPayrollActive: e.target.checked })}
                className="h-4 w-4 rounded border-border"
              />
              <Label htmlFor="payroll-active" className="!mb-0">Active in payroll</Label>
            </div>

            <div className="sm:col-span-2 flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  )
}
