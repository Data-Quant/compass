'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AssetFilters } from './AssetFilters'
import { AssetTable } from './AssetTable'
import { AssetFormModal } from './AssetFormModal'
import { AssignAssetModal } from './AssignAssetModal'
import type { AssetAssignee, AssetFiltersState, AssetItem } from './types'

interface AssetsManagerWorkspaceProps {
  title: string
  description: string
  detailBasePath: string
}

interface PaginationState {
  page: number
  limit: number
  pages: number
  total: number
}

interface LoginUserResponse {
  users?: Array<{
    id: string
    name: string
    department: string | null
    position: string | null
    email: string | null
  }>
}

export function AssetsManagerWorkspace({
  title,
  description,
  detailBasePath,
}: AssetsManagerWorkspaceProps) {
  const [items, setItems] = useState<AssetItem[]>([])
  const [users, setUsers] = useState<AssetAssignee[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [filters, setFilters] = useState<AssetFiltersState>({
    q: '',
    status: '',
    category: '',
    assigneeId: '',
    warranty: 'all',
  })
  const [pagination, setPagination] = useState<PaginationState>({
    page: 1,
    limit: 20,
    pages: 1,
    total: 0,
  })
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [assignModal, setAssignModal] = useState<{ open: boolean; mode: 'assign' | 'unassign'; asset: AssetItem | null }>({
    open: false,
    mode: 'assign',
    asset: null,
  })
  const [assignSubmitting, setAssignSubmitting] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)

  const debouncedQuery = useMemo(() => filters.q.trim(), [filters.q])

  useEffect(() => {
    loadUsers()
  }, [])

  useEffect(() => {
    loadAssets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.status, filters.category, filters.assigneeId, filters.warranty, pagination.page, pagination.limit, debouncedQuery])

  const loadUsers = async () => {
    try {
      const res = await fetch('/api/auth/login')
      const data = (await res.json()) as LoginUserResponse
      const mapped = (data.users || []).map((user) => ({
        id: user.id,
        name: user.name,
        department: user.department,
        position: user.position,
        email: user.email,
      }))
      setUsers(mapped)
    } catch {
      toast.error('Failed to load users for assignment')
    }
  }

  const loadAssets = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (debouncedQuery) params.set('q', debouncedQuery)
      if (filters.status) params.set('status', filters.status)
      if (filters.category) params.set('category', filters.category)
      if (filters.assigneeId) params.set('assigneeId', filters.assigneeId)
      params.set('warranty', filters.warranty)
      params.set('page', String(pagination.page))
      params.set('limit', String(pagination.limit))

      const res = await fetch(`/api/assets?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load assets')
      }

      const nextItems = data.items || []
      setItems(nextItems)
      setPagination((prev) => ({
        ...prev,
        page: data.pagination?.page || prev.page,
        pages: data.pagination?.pages || 1,
        total: data.pagination?.total || 0,
      }))
      setCategories((prev) =>
        Array.from(new Set([...prev, ...nextItems.map((item: AssetItem) => item.category).filter(Boolean)])).sort((a, b) =>
          a.localeCompare(b)
        )
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load assets')
    } finally {
      setLoading(false)
    }
  }

  const createAsset = async (payload: Record<string, unknown>) => {
    setFormSubmitting(true)
    try {
      const res = await fetch('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to create asset')
      }
      toast.success('Asset created')
      setFormOpen(false)
      loadAssets()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create asset')
    } finally {
      setFormSubmitting(false)
    }
  }

  const openAssign = (asset: AssetItem) => {
    setAssignModal({ open: true, mode: 'assign', asset })
  }

  const openUnassign = (asset: AssetItem) => {
    setAssignModal({ open: true, mode: 'unassign', asset })
  }

  const assignAsset = async (employeeId: string, note?: string) => {
    if (!assignModal.asset) return
    setAssignSubmitting(true)
    try {
      const res = await fetch(`/api/assets/${assignModal.asset.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, note }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to assign asset')
      }
      toast.success('Asset assigned')
      setAssignModal({ open: false, mode: 'assign', asset: null })
      loadAssets()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to assign asset')
    } finally {
      setAssignSubmitting(false)
    }
  }

  const unassignAsset = async (note?: string, setStatus?: 'IN_STOCK' | 'IN_REPAIR') => {
    if (!assignModal.asset) return
    setAssignSubmitting(true)
    try {
      const res = await fetch(`/api/assets/${assignModal.asset.id}/unassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note, setStatus }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to unassign asset')
      }
      toast.success('Asset unassigned')
      setAssignModal({ open: false, mode: 'assign', asset: null })
      loadAssets()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to unassign asset')
    } finally {
      setAssignSubmitting(false)
    }
  }

  const importCsv = async () => {
    if (!importFile) {
      toast.error('Select a CSV file first')
      return
    }

    setImporting(true)
    try {
      const form = new FormData()
      form.set('file', importFile)
      const res = await fetch('/api/assets/import', {
        method: 'POST',
        body: form,
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to import assets')
      }

      if (Array.isArray(data.errors) && data.errors.length > 0) {
        toast.warning(`Imported ${data.imported}. ${data.errors.length} row(s) had errors.`)
      } else {
        toast.success(`Imported ${data.imported} asset row(s).`)
      }
      setImportFile(null)
      loadAssets()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to import assets')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-semibold text-foreground">{title}</h1>
          <p className="text-muted-foreground mt-1">{description}</p>
        </div>
        <Button onClick={() => setFormOpen(true)}>Add Asset</Button>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <AssetFilters value={filters} assignees={users} categories={categories} onChange={(next) => {
            setFilters(next)
            setPagination((prev) => ({ ...prev, page: 1 }))
          }} />

          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
            <div>
              <Label className="mb-2">Bulk Import CSV</Label>
              <Input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              />
            </div>
            <Button variant="outline" onClick={importCsv} disabled={importing}>
              {importing ? 'Importing...' : 'Import'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">Loading assets...</CardContent>
        </Card>
      ) : (
        <AssetTable
          items={items}
          detailBasePath={detailBasePath}
          onAssign={openAssign}
          onUnassign={openUnassign}
        />
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Showing page {pagination.page} of {Math.max(1, pagination.pages)} · {pagination.total} total asset(s)
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={pagination.page <= 1}
            onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={pagination.page >= pagination.pages}
            onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
          >
            Next
          </Button>
        </div>
      </div>

      <AssetFormModal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={createAsset}
        submitting={formSubmitting}
        title="Add Equipment Asset"
      />

      <AssignAssetModal
        isOpen={assignModal.open}
        mode={assignModal.mode}
        asset={assignModal.asset}
        users={users}
        submitting={assignSubmitting}
        onClose={() => setAssignModal({ open: false, mode: 'assign', asset: null })}
        onAssign={assignAsset}
        onUnassign={unassignAsset}
      />
    </div>
  )
}

