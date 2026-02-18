'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { WarrantyBadge } from './WarrantyBadge'
import { AssetFormModal } from './AssetFormModal'
import { AssignAssetModal } from './AssignAssetModal'
import { AssetHistoryTimeline } from './AssetHistoryTimeline'
import type { AssetAssignment, AssetAssignee, AssetEvent, AssetItem } from './types'

interface AssetDetailItem extends AssetItem {
  assignments: AssetAssignment[]
  events: AssetEvent[]
}

interface AssetDetailWorkspaceProps {
  assetId: string
  listHref: string
}

export function AssetDetailWorkspace({ assetId, listHref }: AssetDetailWorkspaceProps) {
  const [item, setItem] = useState<AssetDetailItem | null>(null)
  const [users, setUsers] = useState<AssetAssignee[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignMode, setAssignMode] = useState<'assign' | 'unassign'>('assign')
  const [assignSubmitting, setAssignSubmitting] = useState(false)

  const assigneeLabel = useMemo(() => {
    if (!item?.currentAssignee) return 'Unassigned'
    return `${item.currentAssignee.name}${item.currentAssignee.department ? ` (${item.currentAssignee.department})` : ''}`
  }, [item])

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId])

  const loadData = async () => {
    setLoading(true)
    try {
      const [assetRes, usersRes] = await Promise.all([
        fetch(`/api/assets/${assetId}`),
        fetch('/api/auth/login'),
      ])
      const [assetData, usersData] = await Promise.all([assetRes.json(), usersRes.json()])

      if (!assetRes.ok || assetData.error) {
        throw new Error(assetData.error || 'Failed to load asset')
      }
      setItem(assetData.item)
      setUsers(
        (usersData.users || []).map((user: any) => ({
          id: user.id,
          name: user.name,
          department: user.department,
          position: user.position,
          email: user.email,
        }))
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load asset')
    } finally {
      setLoading(false)
    }
  }

  const updateAsset = async (payload: Record<string, unknown>) => {
    setFormSubmitting(true)
    try {
      const res = await fetch(`/api/assets/${assetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to update asset')
      }
      toast.success('Asset updated')
      setFormOpen(false)
      loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update asset')
    } finally {
      setFormSubmitting(false)
    }
  }

  const assignAsset = async (employeeId: string, note?: string) => {
    setAssignSubmitting(true)
    try {
      const res = await fetch(`/api/assets/${assetId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, note }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to assign asset')
      }
      toast.success('Asset assigned')
      setAssignOpen(false)
      loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to assign asset')
    } finally {
      setAssignSubmitting(false)
    }
  }

  const unassignAsset = async (note?: string, setStatus?: 'IN_STOCK' | 'IN_REPAIR') => {
    setAssignSubmitting(true)
    try {
      const res = await fetch(`/api/assets/${assetId}/unassign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note, setStatus }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to unassign asset')
      }
      toast.success('Asset unassigned')
      setAssignOpen(false)
      loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to unassign asset')
    } finally {
      setAssignSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 sm:p-8 max-w-7xl mx-auto">
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">Loading asset...</CardContent>
        </Card>
      </div>
    )
  }

  if (!item) {
    return (
      <div className="p-6 sm:p-8 max-w-7xl mx-auto">
        <Card>
          <CardContent className="p-8 text-center space-y-4">
            <p className="text-sm text-muted-foreground">Asset not found.</p>
            <Button asChild variant="outline">
              <Link href={listHref}>Back to Assets</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-semibold text-foreground">{item.assetName}</h1>
          <p className="text-muted-foreground mt-1">
            {item.equipmentId} · {item.category}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={listHref}>Back</Link>
          </Button>
          <Button variant="outline" onClick={() => setFormOpen(true)}>Edit</Button>
          {item.currentAssignee ? (
            <Button
              onClick={() => {
                setAssignMode('unassign')
                setAssignOpen(true)
              }}
            >
              Unassign
            </Button>
          ) : (
            <Button
              onClick={() => {
                setAssignMode('assign')
                setAssignOpen(true)
              }}
            >
              Assign
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Status</p>
            <Badge className="mt-1">{item.status.replace(/_/g, ' ')}</Badge>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Condition</p>
            <Badge variant="outline" className="mt-1">{item.condition}</Badge>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Assigned To</p>
            <p className="text-sm font-medium mt-1">{assigneeLabel}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Warranty</p>
            <div className="mt-1">
              <WarrantyBadge warrantyEndDate={item.warrantyEndDate} />
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Brand / Model</p>
            <p className="text-sm mt-1">{[item.brand, item.model].filter(Boolean).join(' / ') || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Serial Number</p>
            <p className="text-sm mt-1">{item.serialNumber || '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Purchase</p>
            <p className="text-sm mt-1">
              {item.purchaseCost !== null ? `${item.purchaseCurrency} ${item.purchaseCost.toLocaleString()}` : '—'}
            </p>
            <p className="text-xs text-muted-foreground">
              {item.purchaseDate ? new Date(item.purchaseDate).toLocaleDateString() : ''}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Location / Vendor</p>
            <p className="text-sm mt-1">{item.location || '—'}</p>
            <p className="text-xs text-muted-foreground">{item.vendor || ''}</p>
          </div>
          <div className="md:col-span-4">
            <p className="text-xs text-muted-foreground">Notes</p>
            <p className="text-sm mt-1 whitespace-pre-wrap">{item.notes || '—'}</p>
          </div>
        </CardContent>
      </Card>

      <AssetHistoryTimeline assignments={item.assignments || []} events={item.events || []} />

      <AssetFormModal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={updateAsset}
        submitting={formSubmitting}
        title="Edit Asset"
        initial={item}
      />

      <AssignAssetModal
        isOpen={assignOpen}
        mode={assignMode}
        asset={item}
        users={users}
        submitting={assignSubmitting}
        onClose={() => setAssignOpen(false)}
        onAssign={assignAsset}
        onUnassign={unassignAsset}
      />
    </div>
  )
}

