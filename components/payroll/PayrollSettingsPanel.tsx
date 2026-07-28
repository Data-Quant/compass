'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ALL_TEAMS, TEAM_LABELS } from '@/lib/handbook/teams'
import type { TeamTag } from '@prisma/client'

interface Props {
  canEdit: boolean
}

interface TravelTier {
  id: string
  transportMode: 'CAR' | 'BIKE' | 'PUBLIC_TRANSPORT'
  minKm: number
  maxKm: number | null
  monthlyRate: number
  effectiveFrom: string
  effectiveTo: string | null
  isActive: boolean
}

interface TaxBracket {
  id: string
  incomeFrom: number
  incomeTo: number | null
  fixedTax: number
  taxRate: number
  orderIndex: number
}

interface FinancialYear {
  id: string
  label: string
  startDate: string
  endDate: string
  isActive: boolean
  taxBrackets: TaxBracket[]
}

interface Department {
  id: string
  name: string
  isActive: boolean
}

interface EmploymentType {
  id: string
  name: string
  isActive: boolean
}

interface SalaryHead {
  id: string
  code: string
  name: string
  type: 'EARNING' | 'DEDUCTION'
  isTaxable: boolean
  isSystem: boolean
  isActive: boolean
}

interface PublicHoliday {
  id: string
  holidayDate: string
  name: string
  teamTags: TeamTag[]
}

// Country groupings, so a national holiday can be applied to both entities in that
// country in one click rather than remembering which tags pair up.
const TEAM_PRESETS: Array<{ label: string; teams: TeamTag[] }> = [
  { label: 'All Pakistan', teams: ['PAKISTAN', 'THREE_E_PAKISTAN'] },
  { label: 'All Morocco', teams: ['MOROCCO', 'THREE_E_MOROCCO'] },
  { label: 'Everyone', teams: [...ALL_TEAMS] },
]

export function PayrollSettingsPanel({ canEdit }: Props) {
  const [loading, setLoading] = useState(true)
  const [travelTiers, setTravelTiers] = useState<TravelTier[]>([])
  const [financialYears, setFinancialYears] = useState<FinancialYear[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [employmentTypes, setEmploymentTypes] = useState<EmploymentType[]>([])
  const [salaryHeads, setSalaryHeads] = useState<SalaryHead[]>([])
  const [publicHolidays, setPublicHolidays] = useState<PublicHoliday[]>([])

  const [departmentName, setDepartmentName] = useState('')
  const [employmentTypeName, setEmploymentTypeName] = useState('')
  const [salaryHeadForm, setSalaryHeadForm] = useState({
    code: '',
    name: '',
    type: 'EARNING',
    isTaxable: false,
  })
  const [holidayForm, setHolidayForm] = useState<{
    holidayDate: string
    name: string
    teamTags: TeamTag[]
  }>({
    holidayDate: '',
    name: '',
    teamTags: [],
  })
  const [editingHolidayId, setEditingHolidayId] = useState<string | null>(null)
  const [editingTeamTags, setEditingTeamTags] = useState<TeamTag[]>([])
  const [sendingDigest, setSendingDigest] = useState(false)
  // Defaults to the current month, which is what the "send now" case needs after
  // this month's holidays have just been entered.
  const [digestMonth, setDigestMonth] = useState(() => new Date().toISOString().slice(0, 7))

  const [travelForm, setTravelForm] = useState({
    transportMode: 'BIKE',
    minKm: '',
    maxKm: '',
    monthlyRate: '',
    effectiveFrom: '',
  })

  const [yearForm, setYearForm] = useState({
    label: '',
    startDate: '',
    endDate: '',
  })

  const [bracketForm, setBracketForm] = useState({
    financialYearId: '',
    incomeFrom: '',
    incomeTo: '',
    fixedTax: '',
    taxRate: '',
    orderIndex: '',
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [tiersRes, yearsRes, departmentsRes, employmentRes, salaryHeadsRes, holidaysRes] = await Promise.all([
        fetch('/api/payroll/travel-tiers'),
        fetch('/api/payroll/financial-years'),
        fetch('/api/payroll/departments'),
        fetch('/api/payroll/employment-types'),
        fetch('/api/payroll/salary-heads'),
        fetch('/api/payroll/public-holidays'),
      ])
      const tiersJson = await tiersRes.json()
      const yearsJson = await yearsRes.json()
      const departmentsJson = await departmentsRes.json()
      const employmentJson = await employmentRes.json()
      const salaryHeadsJson = await salaryHeadsRes.json()
      const holidaysJson = await holidaysRes.json()

      if (!tiersRes.ok) throw new Error(tiersJson.error || 'Failed to load travel tiers')
      if (!yearsRes.ok) throw new Error(yearsJson.error || 'Failed to load financial years')
      if (!departmentsRes.ok) throw new Error(departmentsJson.error || 'Failed to load departments')
      if (!employmentRes.ok) throw new Error(employmentJson.error || 'Failed to load employment types')
      if (!salaryHeadsRes.ok) throw new Error(salaryHeadsJson.error || 'Failed to load salary heads')
      if (!holidaysRes.ok) throw new Error(holidaysJson.error || 'Failed to load public holidays')

      setTravelTiers(tiersJson.travelTiers || [])
      setFinancialYears(yearsJson.financialYears || [])
      setDepartments(departmentsJson.departments || [])
      setEmploymentTypes(employmentJson.employmentTypes || [])
      setSalaryHeads(salaryHeadsJson.salaryHeads || [])
      setPublicHolidays(holidaysJson.holidays || [])
      const firstYearId = yearsJson.financialYears?.[0]?.id || ''
      setBracketForm((prev) => ({ ...prev, financialYearId: prev.financialYearId || firstYearId }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load payroll settings')
    } finally {
      setLoading(false)
    }
  }

  const activeYear = useMemo(
    () => financialYears.find((year) => year.isActive) || null,
    [financialYears]
  )

  const submitTravelTier = async (e: FormEvent) => {
    e.preventDefault()
    try {
      const payload = {
        transportMode: travelForm.transportMode,
        minKm: Number(travelForm.minKm),
        maxKm: travelForm.maxKm ? Number(travelForm.maxKm) : null,
        monthlyRate: Number(travelForm.monthlyRate),
        effectiveFrom: travelForm.effectiveFrom || new Date().toISOString(),
      }
      const res = await fetch('/api/payroll/travel-tiers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create travel tier')
      toast.success('Travel tier added')
      setTravelForm({
        transportMode: 'BIKE',
        minKm: '',
        maxKm: '',
        monthlyRate: '',
        effectiveFrom: '',
      })
      loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create travel tier')
    }
  }

  const submitFinancialYear = async (e: FormEvent) => {
    e.preventDefault()
    try {
      const res = await fetch('/api/payroll/financial-years', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(yearForm),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create financial year')
      toast.success('Financial year added')
      setYearForm({ label: '', startDate: '', endDate: '' })
      loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create financial year')
    }
  }

  const activateFinancialYear = async (id: string) => {
    try {
      const res = await fetch(`/api/payroll/financial-years/${id}/activate`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to activate year')
      toast.success('Financial year activated')
      loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to activate financial year')
    }
  }

  const submitTaxBracket = async (e: FormEvent) => {
    e.preventDefault()
    try {
      const payload = {
        financialYearId: bracketForm.financialYearId,
        incomeFrom: Number(bracketForm.incomeFrom),
        incomeTo: bracketForm.incomeTo ? Number(bracketForm.incomeTo) : null,
        fixedTax: Number(bracketForm.fixedTax),
        taxRate: Number(bracketForm.taxRate),
        orderIndex: Number(bracketForm.orderIndex),
      }
      const res = await fetch('/api/payroll/tax-brackets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create tax bracket')
      toast.success('Tax bracket added')
      setBracketForm((prev) => ({
        ...prev,
        incomeFrom: '',
        incomeTo: '',
        fixedTax: '',
        taxRate: '',
        orderIndex: '',
      }))
      loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create tax bracket')
    }
  }

  const submitDepartment = async (e: FormEvent) => {
    e.preventDefault()
    try {
      const res = await fetch('/api/payroll/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: departmentName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create department')
      toast.success('Department added')
      setDepartmentName('')
      loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create department')
    }
  }

  const submitEmploymentType = async (e: FormEvent) => {
    e.preventDefault()
    try {
      const res = await fetch('/api/payroll/employment-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: employmentTypeName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create employment type')
      toast.success('Employment type added')
      setEmploymentTypeName('')
      loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create employment type')
    }
  }

  const submitSalaryHead = async (e: FormEvent) => {
    e.preventDefault()
    try {
      const res = await fetch('/api/payroll/salary-heads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: salaryHeadForm.code,
          name: salaryHeadForm.name,
          type: salaryHeadForm.type,
          isTaxable: salaryHeadForm.isTaxable,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create salary head')
      toast.success('Salary head added')
      setSalaryHeadForm({
        code: '',
        name: '',
        type: 'EARNING',
        isTaxable: false,
      })
      loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create salary head')
    }
  }

  const toggleTeam = (teams: TeamTag[], team: TeamTag): TeamTag[] =>
    teams.includes(team) ? teams.filter((t) => t !== team) : [...teams, team]

  const submitHoliday = async (e: FormEvent) => {
    e.preventDefault()
    if (holidayForm.teamTags.length === 0) {
      toast.error('Select at least one team for this holiday')
      return
    }
    try {
      const res = await fetch('/api/payroll/public-holidays', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(holidayForm),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create public holiday')
      toast.success('Public holiday added')
      setHolidayForm({ holidayDate: '', name: '', teamTags: [] })
      loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create public holiday')
    }
  }

  /**
   * Send the month's holiday digest now, rather than waiting for the 1st.
   *
   * Mail to the whole company cannot be recalled, so this previews first and asks
   * for confirmation using the real recipient counts. The preview runs the same
   * code path as the send, so what is confirmed is what goes out.
   */
  const sendHolidayDigest = async () => {
    setSendingDigest(true)
    try {
      const previewRes = await fetch(
        `/api/payroll/public-holidays/reminders?month=${digestMonth}&dryRun=true`
      )
      const preview = await previewRes.json()
      if (!previewRes.ok) throw new Error(preview.error || 'Failed to preview digest')

      if (!preview.plan?.length) {
        toast.info(`No holidays are tagged for ${preview.month}, so there is nothing to send.`)
        return
      }

      const teamLines = preview.plan
        .map(
          (entry: { teamLabel: string; recipients: number; holidays: string[] }) =>
            `• ${entry.teamLabel}: ${entry.recipients} people (${entry.holidays.join(', ')})`
        )
        .join('\n')

      const confirmed = window.confirm(
        `Send the ${preview.month} public holiday digest now?\n\n${teamLines}\n\n` +
          `CC: ${preview.ccCount} (HR, Partners, Execution)\n\nThis sends real email immediately.`
      )
      if (!confirmed) return

      const res = await fetch(`/api/payroll/public-holidays/reminders?month=${digestMonth}`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send digest')

      toast.success(`Sent ${data.sent} team digest${data.sent === 1 ? '' : 's'} for ${data.month}`)
      if (data.skipped?.length) {
        toast.warning(`Skipped: ${data.skipped.join('; ')}`)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send digest')
    } finally {
      setSendingDigest(false)
    }
  }

  const saveHolidayTeams = async (id: string) => {
    if (editingTeamTags.length === 0) {
      toast.error('Select at least one team for this holiday')
      return
    }
    try {
      const res = await fetch('/api/payroll/public-holidays', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, teamTags: editingTeamTags }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update holiday')
      toast.success('Teams updated')
      setEditingHolidayId(null)
      loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update holiday')
    }
  }

  const deleteHoliday = async (id: string) => {
    try {
      const res = await fetch(`/api/payroll/public-holidays?id=${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete holiday')
      toast.success('Holiday removed')
      loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete holiday')
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold font-display">Master Lists</h3>
            {!canEdit && <p className="text-xs text-muted-foreground">Read-only for O&A</p>}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="rounded-lg border border-border p-4 space-y-3">
              <p className="text-sm font-medium">Departments</p>
              <div className="space-y-1">
                {departments.map((department) => (
                  <div key={department.id} className="text-sm text-muted-foreground">
                    {department.name}
                  </div>
                ))}
                {!departments.length && <p className="text-sm text-muted-foreground">No departments</p>}
              </div>
              {canEdit && (
                <form onSubmit={submitDepartment} className="flex gap-2">
                  <Input value={departmentName} onChange={(e) => setDepartmentName(e.target.value)} placeholder="New department" required />
                  <Button type="submit">Add</Button>
                </form>
              )}
            </div>

            <div className="rounded-lg border border-border p-4 space-y-3">
              <p className="text-sm font-medium">Employment Types</p>
              <div className="space-y-1">
                {employmentTypes.map((employmentType) => (
                  <div key={employmentType.id} className="text-sm text-muted-foreground">
                    {employmentType.name}
                  </div>
                ))}
                {!employmentTypes.length && <p className="text-sm text-muted-foreground">No employment types</p>}
              </div>
              {canEdit && (
                <form onSubmit={submitEmploymentType} className="flex gap-2">
                  <Input value={employmentTypeName} onChange={(e) => setEmploymentTypeName(e.target.value)} placeholder="New type" required />
                  <Button type="submit">Add</Button>
                </form>
              )}
            </div>

            <div className="rounded-lg border border-border p-4 space-y-3">
              <p className="text-sm font-medium">Salary Heads</p>
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {salaryHeads.map((head) => (
                  <div key={head.id} className="text-sm text-muted-foreground">
                    {head.name} ({head.code}) {head.isSystem ? '• System' : ''}
                  </div>
                ))}
                {!salaryHeads.length && <p className="text-sm text-muted-foreground">No salary heads</p>}
              </div>
              {canEdit && (
                <form onSubmit={submitSalaryHead} className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={salaryHeadForm.code} onChange={(e) => setSalaryHeadForm({ ...salaryHeadForm, code: e.target.value.toUpperCase() })} placeholder="CODE" required />
                    <Input value={salaryHeadForm.name} onChange={(e) => setSalaryHeadForm({ ...salaryHeadForm, name: e.target.value })} placeholder="Name" required />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={salaryHeadForm.type} onValueChange={(v) => setSalaryHeadForm({ ...salaryHeadForm, type: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EARNING">Earning</SelectItem>
                        <SelectItem value="DEDUCTION">Deduction</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={salaryHeadForm.isTaxable ? 'YES' : 'NO'} onValueChange={(v) => setSalaryHeadForm({ ...salaryHeadForm, isTaxable: v === 'YES' })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NO">Non-taxable</SelectItem>
                        <SelectItem value="YES">Taxable</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" className="w-full">Add Head</Button>
                </form>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold font-display">Travel Allowance Tiers</h3>
            {!canEdit && <p className="text-xs text-muted-foreground">Read-only for O&A</p>}
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mode</TableHead>
                  <TableHead>Distance (KM)</TableHead>
                  <TableHead>Monthly Rate</TableHead>
                  <TableHead>Effective</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {travelTiers.map((tier) => (
                  <TableRow key={tier.id}>
                    <TableCell>{tier.transportMode}</TableCell>
                    <TableCell>
                      {tier.minKm} - {tier.maxKm ?? '∞'}
                    </TableCell>
                    <TableCell>PKR {tier.monthlyRate.toLocaleString()}</TableCell>
                    <TableCell>
                      {new Date(tier.effectiveFrom).toLocaleDateString()}
                      {tier.effectiveTo ? ` → ${new Date(tier.effectiveTo).toLocaleDateString()}` : ''}
                    </TableCell>
                    <TableCell>{tier.isActive ? 'Active' : 'Inactive'}</TableCell>
                  </TableRow>
                ))}
                {!travelTiers.length && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      {loading ? 'Loading...' : 'No travel tiers'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {canEdit && (
            <form onSubmit={submitTravelTier} className="grid grid-cols-5 gap-3 mt-4 items-end">
              <div className="space-y-1.5">
                <Label>Mode</Label>
                <Select
                  value={travelForm.transportMode}
                  onValueChange={(v) => setTravelForm({ ...travelForm, transportMode: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BIKE">Bike</SelectItem>
                    <SelectItem value="CAR">Car</SelectItem>
                    <SelectItem value="PUBLIC_TRANSPORT">Public Transport</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Min KM</Label>
                <Input value={travelForm.minKm} onChange={(e) => setTravelForm({ ...travelForm, minKm: e.target.value })} type="number" min={0} required />
              </div>
              <div className="space-y-1.5">
                <Label>Max KM</Label>
                <Input value={travelForm.maxKm} onChange={(e) => setTravelForm({ ...travelForm, maxKm: e.target.value })} type="number" min={0} />
              </div>
              <div className="space-y-1.5">
                <Label>Monthly Rate</Label>
                <Input value={travelForm.monthlyRate} onChange={(e) => setTravelForm({ ...travelForm, monthlyRate: e.target.value })} type="number" min={0} required />
              </div>
              <div className="space-y-1.5">
                <Label>Effective From</Label>
                <Input value={travelForm.effectiveFrom} onChange={(e) => setTravelForm({ ...travelForm, effectiveFrom: e.target.value })} type="date" required />
              </div>
              <div className="col-span-5 flex justify-end">
                <Button type="submit">Add Tier</Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold font-display">Public Holidays</h3>
            {!canEdit && <p className="text-xs text-muted-foreground">O&A can manage holidays in the Attendance tab</p>}
          </div>

          {canEdit && (
            <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-border bg-muted/20 p-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">Send monthly digest</p>
                <p className="text-xs text-muted-foreground">
                  Each team is emailed its holidays automatically on the 1st. Use this to send
                  now, after adding a month&apos;s holidays late.
                </p>
              </div>
              <div className="flex items-end gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="digest-month" className="text-xs">Month</Label>
                  <Input
                    id="digest-month"
                    type="month"
                    value={digestMonth}
                    onChange={(e) => setDigestMonth(e.target.value)}
                    className="w-[150px]"
                  />
                </div>
                <Button variant="outline" onClick={sendHolidayDigest} disabled={sendingDigest}>
                  {sendingDigest ? 'Checking...' : 'Send Digest'}
                </Button>
              </div>
            </div>
          )}
          <div className="space-y-2">
            {publicHolidays.map((holiday) => (
              <div key={holiday.id} className="rounded-md bg-muted/40 px-3 py-2 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{holiday.name}</p>
                    <p className="text-xs text-muted-foreground">{new Date(holiday.holidayDate).toLocaleDateString()}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {holiday.teamTags?.length
                        ? holiday.teamTags.map((t) => TEAM_LABELS[t]).join(', ')
                        : 'All teams (untagged)'}
                    </p>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingHolidayId(editingHolidayId === holiday.id ? null : holiday.id)
                          setEditingTeamTags(holiday.teamTags || [])
                        }}
                      >
                        {editingHolidayId === holiday.id ? 'Cancel' : 'Edit Teams'}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteHoliday(holiday.id)}>
                        Remove
                      </Button>
                    </div>
                  )}
                </div>

                {canEdit && editingHolidayId === holiday.id && (
                  <div className="border-t border-border pt-2 space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {ALL_TEAMS.map((team) => (
                        <button
                          key={team}
                          type="button"
                          onClick={() => setEditingTeamTags((prev) => toggleTeam(prev, team))}
                          className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                            editingTeamTags.includes(team)
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-background text-foreground border-border hover:bg-muted'
                          }`}
                        >
                          {TEAM_LABELS[team]}
                        </button>
                      ))}
                    </div>
                    <div className="flex justify-end">
                      <Button size="sm" onClick={() => saveHolidayTeams(holiday.id)}>
                        Save Teams
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {!publicHolidays.length && <p className="text-sm text-muted-foreground">No public holidays configured.</p>}
          </div>
          {canEdit && (
            <form onSubmit={submitHoliday} className="grid grid-cols-3 gap-2 items-end">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input type="date" value={holidayForm.holidayDate} onChange={(e) => setHolidayForm({ ...holidayForm, holidayDate: e.target.value })} required />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Name</Label>
                <Input value={holidayForm.name} onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })} placeholder="e.g. Eid Holiday" required />
              </div>
              <div className="col-span-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Applies To</Label>
                  <div className="flex gap-1">
                    {TEAM_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => setHolidayForm((prev) => ({ ...prev, teamTags: preset.teams }))}
                        className="px-2 py-0.5 text-xs rounded border border-border text-muted-foreground hover:bg-muted"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_TEAMS.map((team) => (
                    <button
                      key={team}
                      type="button"
                      onClick={() =>
                        setHolidayForm((prev) => ({ ...prev, teamTags: toggleTeam(prev.teamTags, team) }))
                      }
                      className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                        holidayForm.teamTags.includes(team)
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-background text-foreground border-border hover:bg-muted'
                      }`}
                    >
                      {TEAM_LABELS[team]}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Only these teams see the holiday and receive reminders, and only their
                  working days are reduced for travel allowance.
                </p>
              </div>
              <div className="col-span-3 flex justify-end">
                <Button type="submit">Add Holiday</Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold font-display">Financial Years & Tax Brackets</h3>
            {!canEdit && <p className="text-xs text-muted-foreground">Read-only for O&A</p>}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-lg border border-border p-4 space-y-3">
              <p className="text-sm font-medium">Financial Years</p>
              <div className="space-y-2">
                {financialYears.map((year) => (
                  <div key={year.id} className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">{year.label}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(year.startDate).toLocaleDateString()} - {new Date(year.endDate).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs ${year.isActive ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                        {year.isActive ? 'Active' : 'Inactive'}
                      </span>
                      {canEdit && !year.isActive && (
                        <Button size="sm" variant="outline" onClick={() => activateFinancialYear(year.id)}>
                          Activate
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {canEdit && (
                <form onSubmit={submitFinancialYear} className="grid grid-cols-3 gap-2 items-end">
                  <div className="space-y-1.5 col-span-3">
                    <Label>Label</Label>
                    <Input value={yearForm.label} onChange={(e) => setYearForm({ ...yearForm, label: e.target.value })} placeholder="FY 2026-2027" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Start Date</Label>
                    <Input value={yearForm.startDate} onChange={(e) => setYearForm({ ...yearForm, startDate: e.target.value })} type="date" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>End Date</Label>
                    <Input value={yearForm.endDate} onChange={(e) => setYearForm({ ...yearForm, endDate: e.target.value })} type="date" required />
                  </div>
                  <div className="flex justify-end">
                    <Button type="submit">Add Year</Button>
                  </div>
                </form>
              )}
            </div>

            <div className="rounded-lg border border-border p-4 space-y-3">
              <p className="text-sm font-medium">Active Year Brackets ({activeYear?.label || 'N/A'})</p>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Slab</TableHead>
                      <TableHead>From</TableHead>
                      <TableHead>To</TableHead>
                      <TableHead>Fixed</TableHead>
                      <TableHead>Rate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(activeYear?.taxBrackets || []).map((bracket) => (
                      <TableRow key={bracket.id}>
                        <TableCell>{bracket.orderIndex}</TableCell>
                        <TableCell>{bracket.incomeFrom.toLocaleString()}</TableCell>
                        <TableCell>{bracket.incomeTo != null ? bracket.incomeTo.toLocaleString() : '∞'}</TableCell>
                        <TableCell>{bracket.fixedTax.toLocaleString()}</TableCell>
                        <TableCell>{(bracket.taxRate * 100).toFixed(2)}%</TableCell>
                      </TableRow>
                    ))}
                    {!activeYear?.taxBrackets?.length && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          No tax brackets configured
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {canEdit && (
                <form onSubmit={submitTaxBracket} className="grid grid-cols-3 gap-2 items-end">
                  <div className="space-y-1.5 col-span-3">
                    <Label>Financial Year</Label>
                    <Select value={bracketForm.financialYearId} onValueChange={(v) => setBracketForm({ ...bracketForm, financialYearId: v })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select year" />
                      </SelectTrigger>
                      <SelectContent>
                        {financialYears.map((year) => (
                          <SelectItem key={year.id} value={year.id}>
                            {year.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>From</Label>
                    <Input value={bracketForm.incomeFrom} onChange={(e) => setBracketForm({ ...bracketForm, incomeFrom: e.target.value })} type="number" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>To</Label>
                    <Input value={bracketForm.incomeTo} onChange={(e) => setBracketForm({ ...bracketForm, incomeTo: e.target.value })} type="number" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Fixed Annual Tax</Label>
                    <Input value={bracketForm.fixedTax} onChange={(e) => setBracketForm({ ...bracketForm, fixedTax: e.target.value })} type="number" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Rate (decimal)</Label>
                    <Input value={bracketForm.taxRate} onChange={(e) => setBracketForm({ ...bracketForm, taxRate: e.target.value })} type="number" step="0.001" required />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Order</Label>
                    <Input value={bracketForm.orderIndex} onChange={(e) => setBracketForm({ ...bracketForm, orderIndex: e.target.value })} type="number" required />
                  </div>
                  <div className="col-span-3 flex justify-end">
                    <Button type="submit">Add Bracket</Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
