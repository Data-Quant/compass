'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { motion } from 'framer-motion'
import {
  Ban,
  Edit2,
  FileSpreadsheet,
  Plus,
  RefreshCw,
  Search,
  Users,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import type { SubscriptionStatus } from '@/types'

type PortalUser = {
  id: string
  name: string
  department: string | null
  role: string
}

type SubscriptionItem = {
  id: string
  name: string
  team: string | null
  usersText: string | null
  paymentMethodText: string | null
  purpose: string | null
  costText: string | null
  subscriptionTypeText: string | null
  billedToText: string | null
  renewalText: string | null
  noticePeriodText: string | null
  personInChargeText: string | null
  lastPaymentText: string | null
  notes: string | null
  sourceSheet: string | null
  status: SubscriptionStatus
  ownerLinks: Array<{
    userId: string
    user: PortalUser
  }>
}

type WorkspaceProps = {
  title: string
  description: string
}

type SubscriptionFormState = {
  name: string
  team: string
  usersText: string
  paymentMethodText: string
  purpose: string
  costText: string
  subscriptionTypeText: string
  billedToText: string
  renewalText: string
  noticePeriodText: string
  personInChargeText: string
  lastPaymentText: string
  notes: string
  sourceSheet: string
  status: SubscriptionStatus
  ownerIds: string[]
}

function createEmptyForm(status: SubscriptionStatus): SubscriptionFormState {
  return {
    name: '',
    team: '',
    usersText: '',
    paymentMethodText: '',
    purpose: '',
    costText: '',
    subscriptionTypeText: '',
    billedToText: '',
    renewalText: '',
    noticePeriodText: '',
    personInChargeText: '',
    lastPaymentText: '',
    notes: '',
    sourceSheet: '',
    status,
    ownerIds: [],
  }
}

function mapItemToForm(item: SubscriptionItem): SubscriptionFormState {
  return {
    name: item.name,
    team: item.team || '',
    usersText: item.usersText || '',
    paymentMethodText: item.paymentMethodText || '',
    purpose: item.purpose || '',
    costText: item.costText || '',
    subscriptionTypeText: item.subscriptionTypeText || '',
    billedToText: item.billedToText || '',
    renewalText: item.renewalText || '',
    noticePeriodText: item.noticePeriodText || '',
    personInChargeText: item.personInChargeText || '',
    lastPaymentText: item.lastPaymentText || '',
    notes: item.notes || '',
    sourceSheet: item.sourceSheet || '',
    status: item.status,
    ownerIds: item.ownerLinks.map((link) => link.user.id),
  }
}

function statusBadgeClass(status: SubscriptionStatus) {
  return status === 'ACTIVE'
    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-0'
    : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-0'
}

export function SubscriptionManagementWorkspace({ title, description }: WorkspaceProps) {
  const [items, setItems] = useState<SubscriptionItem[]>([])
  const [teams, setTeams] = useState<string[]>([])
  const [users, setUsers] = useState<PortalUser[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [selectedItem, setSelectedItem] = useState<SubscriptionItem | null>(null)
  const [form, setForm] = useState<SubscriptionFormState>(createEmptyForm('ACTIVE'))
  const [statusTab, setStatusTab] = useState<SubscriptionStatus>('ACTIVE')
  const [searchTerm, setSearchTerm] = useState('')
  const [teamFilter, setTeamFilter] = useState('')
  const [ownerFilter, setOwnerFilter] = useState('')
  const [ownerSearch, setOwnerSearch] = useState('')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    loadUsers()
  }, [])

  useEffect(() => {
    loadSubscriptions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusTab, searchTerm, teamFilter, ownerFilter])

  const filteredOwnerChoices = useMemo(() => {
    const query = ownerSearch.trim().toLowerCase()
    if (!query) return users
    return users.filter((user) => {
      return (
        user.name.toLowerCase().includes(query) ||
        (user.department || '').toLowerCase().includes(query) ||
        user.role.toLowerCase().includes(query)
      )
    })
  }, [ownerSearch, users])

  const selectedOwnerNames = useMemo(() => {
    const ownerIds = new Set(form.ownerIds)
    return users.filter((user) => ownerIds.has(user.id))
  }, [form.ownerIds, users])

  async function loadUsers() {
    try {
      const res = await fetch('/api/users')
      const data = await res.json()
      setUsers(data.users || [])
    } catch {
      toast.error('Failed to load portal users')
    }
  }

  async function loadSubscriptions() {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('status', statusTab)
      if (searchTerm.trim()) params.set('q', searchTerm.trim())
      if (teamFilter) params.set('team', teamFilter)
      if (ownerFilter) params.set('ownerId', ownerFilter)

      const res = await fetch(`/api/subscriptions?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load subscriptions')
      }
      setItems(data.items || [])
      setTeams(data.teams || [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load subscriptions')
    } finally {
      setLoading(false)
    }
  }

  function openCreateModal() {
    setSelectedItem(null)
    setForm(createEmptyForm(statusTab))
    setOwnerSearch('')
    setFormOpen(true)
  }

  function openEditModal(item: SubscriptionItem) {
    setSelectedItem(item)
    setForm(mapItemToForm(item))
    setOwnerSearch('')
    setFormOpen(true)
  }

  function toggleOwner(userId: string, checked: boolean) {
    setForm((prev) => ({
      ...prev,
      ownerIds: checked
        ? [...new Set([...prev.ownerIds, userId])]
        : prev.ownerIds.filter((id) => id !== userId),
    }))
  }

  async function saveSubscription() {
    if (!form.name.trim()) {
      toast.error('Subscription name is required')
      return
    }

    setFormSubmitting(true)
    try {
      const payload = {
        ...form,
        ownerIds: form.ownerIds,
      }

      const endpoint = selectedItem ? `/api/subscriptions/${selectedItem.id}` : '/api/subscriptions'
      const method = selectedItem ? 'PUT' : 'POST'

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to save subscription')
      }

      toast.success(selectedItem ? 'Subscription updated' : 'Subscription created')
      setFormOpen(false)
      loadSubscriptions()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save subscription')
    } finally {
      setFormSubmitting(false)
    }
  }

  async function updateStatus(item: SubscriptionItem, nextStatus: SubscriptionStatus) {
    try {
      const res = await fetch(`/api/subscriptions/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to update status')
      }

      toast.success(nextStatus === 'CANCELED' ? 'Subscription canceled' : 'Subscription reactivated')
      loadSubscriptions()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update status')
    }
  }

  async function importWorkbook() {
    if (!importFile) {
      toast.error('Select the subscriptions workbook first')
      return
    }

    setImporting(true)
    try {
      const formData = new FormData()
      formData.set('file', importFile)
      formData.set('replaceExisting', 'true')

      const res = await fetch('/api/subscriptions/import', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to import workbook')
      }

      toast.success(
        `Imported ${data.imported} subscriptions (${data.activeImported} active, ${data.canceledImported} canceled)`
      )
      setImportFile(null)
      loadSubscriptions()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to import workbook')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-display font-semibold text-foreground">{title}</h1>
          <p className="text-muted-foreground mt-1 max-w-3xl">{description}</p>
        </div>
        <Button onClick={openCreateModal}>
          <Plus className="h-4 w-4" /> Add Subscription
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <Tabs value={statusTab} onValueChange={(value) => setStatusTab(value as SubscriptionStatus)}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <TabsList>
                <TabsTrigger value="ACTIVE">Active</TabsTrigger>
                <TabsTrigger value="CANCELED">Canceled</TabsTrigger>
              </TabsList>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                <div className="min-w-[220px]">
                  <Label className="mb-2">Search</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      className="pl-10"
                      placeholder="Subscription, owner text, team..."
                    />
                  </div>
                </div>
                <div className="min-w-[180px]">
                  <Label className="mb-2">Team</Label>
                  <Select value={teamFilter || '__all__'} onValueChange={(value) => setTeamFilter(value === '__all__' ? '' : value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="All teams" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All teams</SelectItem>
                      {teams.map((team) => (
                        <SelectItem key={team} value={team}>
                          {team}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="min-w-[220px]">
                  <Label className="mb-2">Owner</Label>
                  <Select value={ownerFilter || '__all__'} onValueChange={(value) => setOwnerFilter(value === '__all__' ? '' : value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="All owners" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All owners</SelectItem>
                      {users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </Tabs>

          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid gap-3 rounded-xl border border-border bg-muted/20 p-4 lg:grid-cols-[1fr_auto]"
          >
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
                Canonical workbook import
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Replaces the current subscription catalog from the workbook&apos;s <span className="font-medium text-foreground">Details</span> and <span className="font-medium text-foreground">Canceled Subscriptions</span> sheets.
              </p>
              <Input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="mt-3"
                onChange={(event) => setImportFile(event.target.files?.[0] || null)}
              />
            </div>
            <div className="flex items-end">
              <Button variant="outline" onClick={importWorkbook} disabled={importing}>
                {importing ? 'Importing...' : 'Replace from Workbook'}
              </Button>
            </div>
          </motion.div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-10 text-center text-sm text-muted-foreground">Loading subscriptions...</div>
          ) : items.length === 0 ? (
            <div className="p-12 text-center">
              <Users className="mx-auto h-12 w-12 text-muted-foreground/20" />
              <p className="mt-4 text-sm text-muted-foreground">No subscriptions match this view yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="px-6 py-4">Subscription</TableHead>
                  <TableHead className="px-6 py-4">Owners</TableHead>
                  <TableHead className="px-6 py-4">Billing</TableHead>
                  <TableHead className="px-6 py-4">Status</TableHead>
                  <TableHead className="px-6 py-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => (
                  <motion.tr
                    key={item.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: index * 0.015 }}
                    className="border-b transition-colors hover:bg-muted/40"
                  >
                    <TableCell className="px-6 py-4 align-top">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-foreground">{item.name}</p>
                          {item.team ? (
                            <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-0">
                              {item.team}
                            </Badge>
                          ) : null}
                          {item.sourceSheet ? (
                            <Badge variant="secondary" className="bg-muted text-muted-foreground border-0">
                              {item.sourceSheet}
                            </Badge>
                          ) : null}
                        </div>
                        {item.purpose ? (
                          <p className="text-sm text-muted-foreground line-clamp-2">{item.purpose}</p>
                        ) : null}
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                          {item.usersText ? <span>Users: {item.usersText}</span> : null}
                          {item.subscriptionTypeText ? <span>Type: {item.subscriptionTypeText}</span> : null}
                          {item.paymentMethodText ? <span>Payment: {item.paymentMethodText}</span> : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-6 py-4 align-top">
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2">
                          {item.ownerLinks.length > 0 ? (
                            item.ownerLinks.map((link) => (
                              <Badge key={link.user.id} variant="secondary" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-0">
                                {link.user.name}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-sm text-muted-foreground">No matched owners</span>
                          )}
                        </div>
                        {item.personInChargeText ? (
                          <p className="text-xs text-muted-foreground">
                            Raw owner text: <span className="text-foreground">{item.personInChargeText}</span>
                          </p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="px-6 py-4 align-top text-sm text-muted-foreground">
                      <div className="space-y-1.5">
                        {item.costText ? <p>Cost: <span className="text-foreground">{item.costText}</span></p> : null}
                        {item.billedToText ? <p>Billed to: <span className="text-foreground">{item.billedToText}</span></p> : null}
                        {item.renewalText ? <p>Renewal: <span className="text-foreground">{item.renewalText}</span></p> : null}
                        {item.noticePeriodText ? <p>Notice: <span className="text-foreground">{item.noticePeriodText}</span></p> : null}
                        {item.lastPaymentText ? <p>Last payment: <span className="text-foreground">{item.lastPaymentText}</span></p> : null}
                      </div>
                    </TableCell>
                    <TableCell className="px-6 py-4 align-top">
                      <Badge variant="secondary" className={statusBadgeClass(item.status)}>
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-6 py-4 align-top">
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => openEditModal(item)}>
                          <Edit2 className="h-3.5 w-3.5" /> Edit
                        </Button>
                        {item.status === 'ACTIVE' ? (
                          <Button variant="outline" size="sm" onClick={() => updateStatus(item, 'CANCELED')}>
                            <Ban className="h-3.5 w-3.5" /> Cancel
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => updateStatus(item, 'ACTIVE')}>
                            <RefreshCw className="h-3.5 w-3.5" /> Reactivate
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </motion.tr>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Modal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        title={selectedItem ? 'Edit Subscription' : 'Add Subscription'}
        size="xl"
      >
        <div className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label className="mb-1">Subscription Name *</Label>
              <Input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
            </div>
            <div>
              <Label className="mb-1">Team</Label>
              <Input value={form.team} onChange={(event) => setForm((prev) => ({ ...prev, team: event.target.value }))} />
            </div>
            <div className="md:col-span-2">
              <Label className="mb-1">Purpose</Label>
              <Textarea value={form.purpose} onChange={(event) => setForm((prev) => ({ ...prev, purpose: event.target.value }))} />
            </div>
            <div>
              <Label className="mb-1">Users (emails / seats)</Label>
              <Textarea value={form.usersText} onChange={(event) => setForm((prev) => ({ ...prev, usersText: event.target.value }))} />
            </div>
            <div>
              <Label className="mb-1">Payment Method</Label>
              <Input value={form.paymentMethodText} onChange={(event) => setForm((prev) => ({ ...prev, paymentMethodText: event.target.value }))} />
            </div>
            <div>
              <Label className="mb-1">Cost</Label>
              <Input value={form.costText} onChange={(event) => setForm((prev) => ({ ...prev, costText: event.target.value }))} />
            </div>
            <div>
              <Label className="mb-1">Subscription Type</Label>
              <Input value={form.subscriptionTypeText} onChange={(event) => setForm((prev) => ({ ...prev, subscriptionTypeText: event.target.value }))} />
            </div>
            <div>
              <Label className="mb-1">Billed To</Label>
              <Input value={form.billedToText} onChange={(event) => setForm((prev) => ({ ...prev, billedToText: event.target.value }))} />
            </div>
            <div>
              <Label className="mb-1">Renewal</Label>
              <Input value={form.renewalText} onChange={(event) => setForm((prev) => ({ ...prev, renewalText: event.target.value }))} />
            </div>
            <div>
              <Label className="mb-1">Notice Period</Label>
              <Input value={form.noticePeriodText} onChange={(event) => setForm((prev) => ({ ...prev, noticePeriodText: event.target.value }))} />
            </div>
            <div>
              <Label className="mb-1">Last Payment</Label>
              <Input value={form.lastPaymentText} onChange={(event) => setForm((prev) => ({ ...prev, lastPaymentText: event.target.value }))} />
            </div>
            <div>
              <Label className="mb-1">Status</Label>
              <Select value={form.status} onValueChange={(value) => setForm((prev) => ({ ...prev, status: value as SubscriptionStatus }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="CANCELED">Canceled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1">Source Sheet</Label>
              <Input value={form.sourceSheet} onChange={(event) => setForm((prev) => ({ ...prev, sourceSheet: event.target.value }))} placeholder="Details / Canceled Subscriptions" />
            </div>
            <div className="md:col-span-2">
              <Label className="mb-1">Person In Charge (raw text)</Label>
              <Input
                value={form.personInChargeText}
                onChange={(event) => setForm((prev) => ({ ...prev, personInChargeText: event.target.value }))}
                placeholder="Keeps imported owner text like Richard/Noha"
              />
            </div>
            <div className="md:col-span-2">
              <Label className="mb-1">Notes</Label>
              <Textarea value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} />
            </div>
          </div>

          <div className="rounded-xl border border-border p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Assigned Owners</p>
                <p className="text-xs text-muted-foreground">
                  Match the subscription to one or more portal users while preserving any raw owner text above.
                </p>
              </div>
              <div className="w-full md:w-72">
                <Input
                  value={ownerSearch}
                  onChange={(event) => setOwnerSearch(event.target.value)}
                  placeholder="Search users, department, or role"
                />
              </div>
            </div>

            {selectedOwnerNames.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedOwnerNames.map((user) => (
                  <Badge key={user.id} variant="secondary" className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-0">
                    {user.name}
                  </Badge>
                ))}
              </div>
            ) : null}

            <div className="mt-4 max-h-56 overflow-y-auto rounded-lg border border-border">
              <div className="divide-y divide-border">
                {filteredOwnerChoices.map((user) => {
                  const checked = form.ownerIds.includes(user.id)
                  return (
                    <label key={user.id} className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-muted/40">
                      <Checkbox checked={checked} onCheckedChange={(value) => toggleOwner(user.id, value === true)} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground">{user.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {user.department || 'No department'} · {user.role}
                        </p>
                      </div>
                    </label>
                  )
                })}
                {filteredOwnerChoices.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-muted-foreground">No users match this owner search.</div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={formSubmitting}>
              Cancel
            </Button>
            <Button onClick={saveSubscription} disabled={formSubmitting}>
              {formSubmitting ? 'Saving...' : selectedItem ? 'Save Changes' : 'Create Subscription'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
