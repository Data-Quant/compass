'use client'

import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Check, Loader2, Pencil, X } from 'lucide-react'
import { buildTravelTierPatch, toTravelTierDraft, type TravelTierDraft } from '@/lib/payroll/travel-tiers'
import { ALL_TEAMS, TEAM_LABELS } from '@/lib/handbook/teams'
import type { TeamTag } from '@prisma/client'

interface Props {
  canEdit: boolean
}

const TRANSPORT_MODE_LABELS: Record<TravelTier['transportMode'], string> = {
  CAR: 'Car',
  BIKE: 'Bike',
  PUBLIC_TRANSPORT: 'Public Transport',
}

interface ListResult<T> {
  data: T[] | null
  /** Human label of the list that failed, for the combined error toast. */
  error: string | null
}

async function fetchList<T>(url: string, key: string, label: string): Promise<ListResult<T>> {
  try {
    const res = await fetch(url)
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      console.error(`Failed to load ${label}:`, json.error || res.status)
      return { data: null, error: label }
    }
    return { data: (json[key] as T[]) || [], error: null }
  } catch (error) {
    console.error(`Failed to load ${label}:`, error)
    return { data: null, error: label }
  }
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
  /** Null until the observing teams have actually been emailed about it. */
  notifiedAt: string | null
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
  const [editingTierId, setEditingTierId] = useState<string | null>(null)
  const [tierDraft, setTierDraft] = useState<TravelTierDraft | null>(null)
  const [savingTier, setSavingTier] = useState(false)
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
  const [editingBracketId, setEditingBracketId] = useState<string | null>(null)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    // Each list loads on its own: a failure in one must not blank the others,
    // and HR should see exactly which list could not be fetched.
    const results = await Promise.all([
      fetchList<TravelTier>('/api/payroll/travel-tiers', 'travelTiers', 'travel tiers'),
      fetchList<FinancialYear>('/api/payroll/financial-years', 'financialYears', 'financial years'),
      fetchList<Department>('/api/payroll/departments', 'departments', 'departments'),
      fetchList<EmploymentType>('/api/payroll/employment-types', 'employmentTypes', 'employment types'),
      fetchList<SalaryHead>('/api/payroll/salary-heads', 'salaryHeads', 'salary heads'),
      fetchList<PublicHoliday>('/api/payroll/public-holidays', 'holidays', 'public holidays'),
    ] as const)
    const [tiers, years, depts, employment, heads, holidays] = results

    if (tiers.data) setTravelTiers(tiers.data)
    if (years.data) {
      setFinancialYears(years.data)
      const firstYearId = years.data[0]?.id || ''
      setBracketForm((prev) => ({ ...prev, financialYearId: prev.financialYearId || firstYearId }))
    }
    if (depts.data) setDepartments(depts.data)
    if (employment.data) setEmploymentTypes(employment.data)
    if (heads.data) setSalaryHeads(heads.data)
    if (holidays.data) setPublicHolidays(holidays.data)

    const failed = results.filter((r) => r.error).map((r) => r.error)
    if (failed.length > 0) {
      toast.error(`Could not load ${failed.join(', ')}. Refresh to try again.`)
    }
    setLoading(false)
  }

  const activeYear = useMemo(
    () => financialYears.find((year) => year.isActive) || null,
    [financialYears]
  )

  const startEditTier = (tier: TravelTier) => {
    setEditingTierId(tier.id)
    setTierDraft(toTravelTierDraft(tier))
  }

  const cancelEditTier = () => {
    setEditingTierId(null)
    setTierDraft(null)
  }

  const updateTierDraft = (patch: Partial<TravelTierDraft>) => {
    setTierDraft((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  const saveTier = async () => {
    if (!editingTierId || !tierDraft) return
    const tier = travelTiers.find((t) => t.id === editingTierId)
    if (!tier) return

    const result = buildTravelTierPatch(tier, tierDraft)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    if (Object.keys(result.patch).length === 0) {
      cancelEditTier()
      return
    }

    setSavingTier(true)
    try {
      const res = await fetch('/api/payroll/travel-tiers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: tier.id, ...result.patch }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update travel tier')
      const saved = data.travelTier as TravelTier
      setTravelTiers((prev) => prev.map((t) => (t.id === tier.id ? { ...t, ...saved } : t)))
      toast.success('Travel tier updated')
      cancelEditTier()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update travel tier')
    } finally {
      setSavingTier(false)
    }
  }

  const tierEditorKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void saveTier()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancelEditTier()
    }
  }

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
      const bracketValues = {
        incomeFrom: Number(bracketForm.incomeFrom),
        incomeTo: bracketForm.incomeTo ? Number(bracketForm.incomeTo) : null,
        fixedTax: Number(bracketForm.fixedTax),
        taxRate: Number(bracketForm.taxRate),
        orderIndex: Number(bracketForm.orderIndex),
      }
      const isEditing = editingBracketId !== null
      const payload = isEditing
        ? { id: editingBracketId, ...bracketValues }
        : { financialYearId: bracketForm.financialYearId, ...bracketValues }
      const res = await fetch('/api/payroll/tax-brackets', {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || `Failed to ${isEditing ? 'update' : 'create'} tax bracket`)
      }
      toast.success(isEditing ? 'Tax bracket updated' : 'Tax bracket added')
      setEditingBracketId(null)
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
      toast.error(error instanceof Error ? error.message : 'Failed to save tax bracket')
    }
  }

  const editTaxBracket = (bracket: TaxBracket) => {
    if (!activeYear) return
    setEditingBracketId(bracket.id)
    setBracketForm({
      financialYearId: activeYear.id,
      incomeFrom: String(bracket.incomeFrom),
      incomeTo: bracket.incomeTo == null ? '' : String(bracket.incomeTo),
      fixedTax: String(bracket.fixedTax),
      taxRate: String(bracket.taxRate),
      orderIndex: String(bracket.orderIndex),
    })
  }

  const cancelTaxBracketEdit = () => {
    setEditingBracketId(null)
    setBracketForm((prev) => ({
      ...prev,
      incomeFrom: '',
      incomeTo: '',
      fixedTax: '',
      taxRate: '',
      orderIndex: '',
    }))
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
   * Send holiday mail now, rather than waiting for the 1st.
   *
   * `scope: 'new'` mails only holidays nobody has been told about yet -- the normal
   * case after adding one mid-month. `scope: 'monthly'` re-sends the whole month,
   * kept for when a digest needs repeating.
   *
   * Mail to the whole company cannot be recalled, so this previews first and asks for
   * confirmation using the real recipient counts. The preview runs the same code path
   * as the send, so what is confirmed is what goes out.
   */
  const sendHolidayMail = async (scope: 'new' | 'monthly') => {
    const isNew = scope === 'new'
    const query = isNew ? 'scope=new' : `month=${digestMonth}`

    setSendingDigest(true)
    try {
      const previewRes = await fetch(
        `/api/payroll/public-holidays/reminders?${query}&dryRun=true`
      )
      const preview = await previewRes.json()
      if (!previewRes.ok) throw new Error(preview.error || 'Failed to preview')

      if (!preview.plan?.length) {
        toast.info(
          isNew
            ? 'Every upcoming holiday has already been announced, so there is nothing new to send.'
            : `No holidays are tagged for ${preview.month}, so there is nothing to send.`
        )
        return
      }

      const teamLines = preview.plan
        .map(
          (entry: { teamLabel: string; recipients: number; holidays: string[] }) =>
            `• ${entry.teamLabel}: ${entry.recipients} people (${entry.holidays.join(', ')})`
        )
        .join('\n')

      const confirmed = window.confirm(
        (isNew
          ? `Announce these newly added holidays now?\n\n${teamLines}\n\n`
          : `Re-send the full ${preview.month} digest to every team below?\n\n${teamLines}\n\n` +
            'This includes holidays already announced.\n\n') +
          `CC: ${preview.ccCount} (HR, Partners, Execution)\n\nThis sends real email immediately.`
      )
      if (!confirmed) return

      const res = await fetch(`/api/payroll/public-holidays/reminders?${query}`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send')

      toast.success(
        isNew
          ? `Announced ${data.announced} new holiday${data.announced === 1 ? '' : 's'} to ${data.sent} team${data.sent === 1 ? '' : 's'}`
          : `Sent ${data.sent} team digest${data.sent === 1 ? '' : 's'} for ${data.month}`
      )
      if (data.skipped?.length) {
        toast.warning(`Skipped: ${data.skipped.join('; ')}`)
      }
      loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send')
    } finally {
      setSendingDigest(false)
    }
  }

  /**
   * Announce one specific holiday to the teams that observe it.
   *
   * Exact by construction: HR names the holiday, so nothing depends on whether its
   * announced state was recorded correctly. This is how a holiday that predates
   * announcement tracking gets sent, and how one is deliberately re-sent.
   */
  const announceHoliday = async (holiday: PublicHoliday) => {
    setSendingDigest(true)
    try {
      const query = `holidayId=${encodeURIComponent(holiday.id)}`
      const previewRes = await fetch(`/api/payroll/public-holidays/reminders?${query}&dryRun=true`)
      const preview = await previewRes.json()
      if (!previewRes.ok) throw new Error(preview.error || 'Failed to preview')

      if (!preview.plan?.length) {
        toast.info(
          `Nobody is tagged for the teams that observe ${holiday.name}, so there is nobody to email.`
        )
        return
      }

      const teamLines = preview.plan
        .map(
          (entry: { teamLabel: string; recipients: number }) =>
            `• ${entry.teamLabel}: ${entry.recipients} people`
        )
        .join('\n')

      const confirmed = window.confirm(
        `${holiday.notifiedAt ? 'Re-announce' : 'Announce'} "${holiday.name}" now?\n\n${teamLines}\n\n` +
          `CC: ${preview.ccCount} (HR, Partners, Execution)\n\nThis sends real email immediately.`
      )
      if (!confirmed) return

      const res = await fetch(`/api/payroll/public-holidays/reminders?${query}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send')

      toast.success(
        `Announced ${holiday.name} to ${data.sent} team${data.sent === 1 ? '' : 's'}`
      )
      if (data.skipped?.length) {
        toast.warning(`Skipped: ${data.skipped.join('; ')}`)
      }
      loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send')
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
    // The page scrolls as one document (the layout's <main> is the scroll container).
    // On large screens Master Lists sticks to the top of that viewport once reached,
    // so it stays in reach while the sections beneath it scroll past. An earlier
    // version made the whole tab a fixed-height column clipped with overflow-hidden;
    // once the hero and tab bar filled the viewport the sections below had no room
    // and could not be scrolled to at all.
    <div className="space-y-4">
      {/*
        Sticky, with a ceiling: departments, employment types and salary heads grow
        as HR adds to them, and without a max-height the pinned card would eventually
        cover the sections it is meant to sit above. The background keeps content
        from showing through the gap beneath the card as it scrolls under.
      */}
      <div className="lg:sticky lg:top-0 lg:z-10 lg:max-h-[45vh] lg:overflow-y-auto lg:bg-background lg:pb-4">
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold font-display">Master Lists</h3>
            {!canEdit && <p className="text-xs text-muted-foreground">Read-only access</p>}
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
      </div>

      <div className="space-y-4 pb-6">
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold font-display">Travel Allowance Tiers</h3>
            {!canEdit && <p className="text-xs text-muted-foreground">Read-only access</p>}
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
                  {canEdit && (
                    <TableHead className="w-[1%] text-right">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {travelTiers.map((tier) =>
                  editingTierId === tier.id && tierDraft ? (
                    <TableRow key={tier.id} className="bg-muted/30">
                      <TableCell>
                        <Select
                          value={tierDraft.transportMode}
                          onValueChange={(v) => updateTierDraft({ transportMode: v })}
                        >
                          <SelectTrigger className="h-8 w-[160px]" aria-label="Transport mode">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="BIKE">Bike</SelectItem>
                            <SelectItem value="CAR">Car</SelectItem>
                            <SelectItem value="PUBLIC_TRANSPORT">Public Transport</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Input
                            aria-label="Min KM"
                            className="h-8 w-20"
                            type="number"
                            min={0}
                            value={tierDraft.minKm}
                            onChange={(e) => updateTierDraft({ minKm: e.target.value })}
                            onKeyDown={tierEditorKeyDown}
                            autoFocus
                          />
                          <span className="text-muted-foreground">-</span>
                          <Input
                            aria-label="Max KM"
                            className="h-8 w-20"
                            type="number"
                            min={0}
                            placeholder="∞"
                            value={tierDraft.maxKm}
                            onChange={(e) => updateTierDraft({ maxKm: e.target.value })}
                            onKeyDown={tierEditorKeyDown}
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <span className="text-muted-foreground text-sm">PKR</span>
                          <Input
                            aria-label="Monthly rate"
                            className="h-8 w-28"
                            type="number"
                            min={0}
                            value={tierDraft.monthlyRate}
                            onChange={(e) => updateTierDraft({ monthlyRate: e.target.value })}
                            onKeyDown={tierEditorKeyDown}
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Input
                            aria-label="Effective from"
                            className="h-8 w-36"
                            type="date"
                            value={tierDraft.effectiveFrom}
                            onChange={(e) => updateTierDraft({ effectiveFrom: e.target.value })}
                            onKeyDown={tierEditorKeyDown}
                          />
                          <span className="text-muted-foreground">→</span>
                          <Input
                            aria-label="Effective to"
                            className="h-8 w-36"
                            type="date"
                            value={tierDraft.effectiveTo}
                            onChange={(e) => updateTierDraft({ effectiveTo: e.target.value })}
                            onKeyDown={tierEditorKeyDown}
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <label className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={tierDraft.isActive}
                            onCheckedChange={(v) => updateTierDraft({ isActive: v === true })}
                          />
                          Active
                        </label>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" onClick={() => void saveTier()} disabled={savingTier}>
                            {savingTier ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={cancelEditTier} disabled={savingTier}>
                            <X className="w-4 h-4" />
                            Cancel
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    <TableRow key={tier.id}>
                      <TableCell>{TRANSPORT_MODE_LABELS[tier.transportMode] ?? tier.transportMode}</TableCell>
                      <TableCell>
                        {tier.minKm} - {tier.maxKm ?? '∞'}
                      </TableCell>
                      <TableCell>PKR {tier.monthlyRate.toLocaleString()}</TableCell>
                      <TableCell>
                        {new Date(tier.effectiveFrom).toLocaleDateString()}
                        {tier.effectiveTo ? ` → ${new Date(tier.effectiveTo).toLocaleDateString()}` : ''}
                      </TableCell>
                      <TableCell>{tier.isActive ? 'Active' : 'Inactive'}</TableCell>
                      {canEdit && (
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => startEditTier(tier)}
                            disabled={editingTierId !== null}
                            aria-label={`Edit ${TRANSPORT_MODE_LABELS[tier.transportMode]} tier ${tier.minKm}-${tier.maxKm ?? '∞'} km`}
                          >
                            <Pencil className="w-4 h-4" />
                            Edit
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  )
                )}
                {!travelTiers.length && (
                  <TableRow>
                    <TableCell colSpan={canEdit ? 6 : 5} className="text-center text-muted-foreground">
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
            {!canEdit && <p className="text-xs text-muted-foreground">Read-only access</p>}
          </div>

          {canEdit && (
            <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-border bg-muted/20 p-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">Announce holidays</p>
                <p className="text-xs text-muted-foreground">
                  Each team is emailed its holidays automatically on the 1st. After adding a
                  holiday mid-month, announce it — only teams that observe it are emailed, and
                  only holidays nobody has been told about yet are included.
                </p>
              </div>
              <div className="flex items-end gap-2">
                <Button onClick={() => sendHolidayMail('new')} disabled={sendingDigest}>
                  {sendingDigest ? 'Checking...' : 'Announce New Holidays'}
                </Button>
              </div>
            </div>
          )}

          {canEdit && (
            <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-border bg-muted/20 p-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">Re-send a full month</p>
                <p className="text-xs text-muted-foreground">
                  Sends every holiday in the chosen month again, including ones already
                  announced. For repeating a digest, not for new holidays.
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
                <Button variant="outline" onClick={() => sendHolidayMail('monthly')} disabled={sendingDigest}>
                  {sendingDigest ? 'Checking...' : 'Re-send Month'}
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
                    <p className="text-xs mt-0.5">
                      {holiday.notifiedAt ? (
                        <span className="text-muted-foreground">
                          Announced {new Date(holiday.notifiedAt).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-amber-600 font-medium">Not announced yet</span>
                      )}
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
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => announceHoliday(holiday)}
                        disabled={sendingDigest}
                      >
                        {holiday.notifiedAt ? 'Re-announce' : 'Announce'}
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
            {!canEdit && <p className="text-xs text-muted-foreground">Read-only access</p>}
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
                      {canEdit && <TableHead className="text-right">Actions</TableHead>}
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
                        {canEdit && (
                          <TableCell className="text-right">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => editTaxBracket(bracket)}
                            >
                              Edit
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                    {!activeYear?.taxBrackets?.length && (
                      <TableRow>
                        <TableCell colSpan={canEdit ? 6 : 5} className="text-center text-muted-foreground">
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
                    <Select
                      value={bracketForm.financialYearId}
                      onValueChange={(v) => setBracketForm({ ...bracketForm, financialYearId: v })}
                      disabled={editingBracketId !== null}
                    >
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
                  <div className="col-span-3 flex justify-end gap-2">
                    {editingBracketId && (
                      <Button type="button" variant="outline" onClick={cancelTaxBracketEdit}>
                        Cancel
                      </Button>
                    )}
                    <Button type="submit">
                      {editingBracketId ? 'Save Changes' : 'Add Bracket'}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  )
}
