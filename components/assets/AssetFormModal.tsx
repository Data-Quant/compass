'use client'

import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ASSET_CATEGORIES,
  ASSET_CONDITIONS,
  ASSET_STATUSES,
  assetCategoryHasSpecs,
  isAssetCategory,
  normalizeAssetLocation,
  normalizeLaptopSpecs,
} from '@/lib/asset-utils'
import { OFFICE_LOCATIONS, OFFICE_LOCATION_CITIES } from '@/lib/office-locations'
import type { AssetItem } from './types'

interface AssetFormValues {
  equipmentId: string
  assetName: string
  category: string
  brand: string
  model: string
  serialNumber: string
  processor: string
  ram: string
  storage: string
  purchaseCost: string
  purchaseCurrency: string
  purchaseDate: string
  warrantyStartDate: string
  warrantyEndDate: string
  vendor: string
  status: string
  condition: string
  location: string
  notes: string
}

interface AssetFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (values: Record<string, unknown>) => Promise<void>
  submitting?: boolean
  title: string
  initial?: AssetItem | null
  suggestedEquipmentId?: string
}

function toDateInput(value: string | null | undefined) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}

function isKnownAssetLocation(value: string) {
  return OFFICE_LOCATION_CITIES.some((city) => city === value)
}

export function AssetFormModal({
  isOpen,
  onClose,
  onSubmit,
  submitting = false,
  title,
  initial,
  suggestedEquipmentId,
}: AssetFormModalProps) {
  const initialValues = useMemo<AssetFormValues>(() => {
    const specs = normalizeLaptopSpecs(initial?.specsJson)
    return {
    equipmentId: initial?.equipmentId || suggestedEquipmentId || '',
    assetName: initial?.assetName || '',
    category: initial?.category || '',
    brand: initial?.brand || '',
    model: initial?.model || '',
    serialNumber: initial?.serialNumber || '',
    processor: specs?.processor || '',
    ram: specs?.ram || '',
    storage: specs?.storage || '',
    purchaseCost: initial?.purchaseCost != null ? String(initial.purchaseCost) : '',
    purchaseCurrency: initial?.purchaseCurrency || 'PKR',
    purchaseDate: toDateInput(initial?.purchaseDate),
    warrantyStartDate: toDateInput(initial?.warrantyStartDate),
    warrantyEndDate: toDateInput(initial?.warrantyEndDate),
    vendor: initial?.vendor || '',
    status: initial?.status || 'IN_STOCK',
    condition: initial?.condition || 'GOOD',
    location: normalizeAssetLocation(initial?.location) || initial?.location || '',
    notes: initial?.notes || '',
    }
  }, [initial, suggestedEquipmentId])

  const [form, setForm] = useState<AssetFormValues>(initialValues)
  // Preserve a legacy free-text location (e.g. "Karachi Office") as a selectable
  // option so editing an old asset doesn't silently drop or rewrite its location.
  const legacyLocation = useMemo(() => {
    const current = initial?.location?.trim()
    return current && !isKnownAssetLocation(current) ? current : null
  }, [initial?.location])

  // Include any legacy (non-predefined) category the asset already has, so editing
  // an old asset does not silently drop its category.
  const categoryOptions = useMemo(() => {
    const current = initial?.category?.trim()
    const base = ASSET_CATEGORIES.map((category) => category.value)
    return current && !isAssetCategory(current) ? [...base, current] : base
  }, [initial?.category])

  const showSpecs = assetCategoryHasSpecs(form.category)

  useEffect(() => {
    if (isOpen) {
      setForm(initialValues)
    }
  }, [initialValues, isOpen])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Only send laptop specs for spec-bearing categories; clear them otherwise so
    // switching a laptop to a non-spec category drops stale hardware details.
    const specsJson = showSpecs
      ? normalizeLaptopSpecs({ processor: form.processor, ram: form.ram, storage: form.storage })
      : null

    const payload: Record<string, unknown> = {
      equipmentId: form.equipmentId,
      assetName: form.assetName,
      category: form.category,
      brand: form.brand || undefined,
      model: form.model || undefined,
      serialNumber: form.serialNumber || undefined,
      specsJson,
      purchaseCost: form.purchaseCost || undefined,
      purchaseCurrency: form.purchaseCurrency || undefined,
      purchaseDate: form.purchaseDate || undefined,
      warrantyStartDate: form.warrantyStartDate || undefined,
      warrantyEndDate: form.warrantyEndDate || undefined,
      vendor: form.vendor || undefined,
      status: form.status || undefined,
      condition: form.condition || undefined,
      location: form.location || undefined,
      notes: form.notes || undefined,
    }

    await onSubmit(payload)
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="xl">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label className="mb-2">Equipment ID</Label>
            <Input
              value={form.equipmentId}
              onChange={(e) => setForm((prev) => ({ ...prev, equipmentId: e.target.value }))}
              placeholder="EQUIP-101"
            />
          </div>
          <div>
            <Label className="mb-2">Asset Name</Label>
            <Input
              required
              value={form.assetName}
              onChange={(e) => setForm((prev) => ({ ...prev, assetName: e.target.value }))}
              placeholder="MacBook Pro 14"
            />
          </div>
          <div>
            <Label className="mb-2">Category</Label>
            <Select
              value={form.category || undefined}
              onValueChange={(value) => setForm((prev) => ({ ...prev, category: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {categoryOptions.map((category) => (
                  <SelectItem key={category} value={category}>
                    {category}{isAssetCategory(category) ? '' : ' (current legacy value)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {showSpecs && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="mb-2">Processor</Label>
              <Input
                value={form.processor}
                onChange={(e) => setForm((prev) => ({ ...prev, processor: e.target.value }))}
                placeholder="Apple M3 Pro / Intel i7-1360P"
              />
            </div>
            <div>
              <Label className="mb-2">RAM</Label>
              <Input
                value={form.ram}
                onChange={(e) => setForm((prev) => ({ ...prev, ram: e.target.value }))}
                placeholder="16GB"
              />
            </div>
            <div>
              <Label className="mb-2">Storage</Label>
              <Input
                value={form.storage}
                onChange={(e) => setForm((prev) => ({ ...prev, storage: e.target.value }))}
                placeholder="512GB SSD"
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label className="mb-2">Brand</Label>
            <Input value={form.brand} onChange={(e) => setForm((prev) => ({ ...prev, brand: e.target.value }))} />
          </div>
          <div>
            <Label className="mb-2">Model</Label>
            <Input value={form.model} onChange={(e) => setForm((prev) => ({ ...prev, model: e.target.value }))} />
          </div>
          <div>
            <Label className="mb-2">Serial Number</Label>
            <Input
              value={form.serialNumber}
              onChange={(e) => setForm((prev) => ({ ...prev, serialNumber: e.target.value }))}
            />
          </div>
          <div>
            <Label className="mb-2">Vendor</Label>
            <Input value={form.vendor} onChange={(e) => setForm((prev) => ({ ...prev, vendor: e.target.value }))} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label className="mb-2">Purchase Cost</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={form.purchaseCost}
              onChange={(e) => setForm((prev) => ({ ...prev, purchaseCost: e.target.value }))}
            />
          </div>
          <div>
            <Label className="mb-2">Currency</Label>
            <Input
              value={form.purchaseCurrency}
              onChange={(e) => setForm((prev) => ({ ...prev, purchaseCurrency: e.target.value.toUpperCase() }))}
              placeholder="PKR"
            />
          </div>
          <div>
            <Label className="mb-2">Purchase Date</Label>
            <Input
              type="date"
              value={form.purchaseDate}
              onChange={(e) => setForm((prev) => ({ ...prev, purchaseDate: e.target.value }))}
            />
          </div>
          <div>
            <Label className="mb-2">Location</Label>
            <Select
              value={form.location || '__none__'}
              onValueChange={(value) => setForm((prev) => ({ ...prev, location: value === '__none__' ? '' : value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No location</SelectItem>
                {OFFICE_LOCATIONS.map((group) => (
                  <SelectGroup key={group.country}>
                    <SelectLabel>{group.country}</SelectLabel>
                    {group.cities.map((city) => (
                      <SelectItem key={city} value={city}>
                        {city}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
                {legacyLocation && (
                  <SelectGroup>
                    <SelectLabel>Other</SelectLabel>
                    <SelectItem value={legacyLocation}>
                      {legacyLocation} (current legacy value)
                    </SelectItem>
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <Label className="mb-2">Warranty Start</Label>
            <Input
              type="date"
              value={form.warrantyStartDate}
              onChange={(e) => setForm((prev) => ({ ...prev, warrantyStartDate: e.target.value }))}
            />
          </div>
          <div>
            <Label className="mb-2">Warranty End</Label>
            <Input
              type="date"
              value={form.warrantyEndDate}
              onChange={(e) => setForm((prev) => ({ ...prev, warrantyEndDate: e.target.value }))}
            />
          </div>
          <div>
            <Label className="mb-2">Status</Label>
            <Select value={form.status} onValueChange={(value) => setForm((prev) => ({ ...prev, status: value }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSET_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status.replace(/_/g, ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-2">Condition</Label>
            <Select
              value={form.condition}
              onValueChange={(value) => setForm((prev) => ({ ...prev, condition: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSET_CONDITIONS.map((condition) => (
                  <SelectItem key={condition} value={condition}>
                    {condition}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label className="mb-2">Notes</Label>
          <Textarea
            rows={4}
            value={form.notes}
            onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
            placeholder="Optional notes..."
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

