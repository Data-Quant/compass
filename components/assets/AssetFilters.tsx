'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ASSET_STATUSES } from '@/lib/asset-utils'
import type { AssetAssignee, AssetFiltersState } from './types'

interface AssetFiltersProps {
  value: AssetFiltersState
  assignees: AssetAssignee[]
  categories: string[]
  onChange: (next: AssetFiltersState) => void
}

export function AssetFilters({ value, assignees, categories, onChange }: AssetFiltersProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
      <div className="md:col-span-2">
        <Label className="mb-2">Search</Label>
        <Input
          placeholder="Equipment ID, name, model, serial..."
          value={value.q}
          onChange={(e) => onChange({ ...value, q: e.target.value })}
        />
      </div>

      <div>
        <Label className="mb-2">Status</Label>
        <Select
          value={value.status || 'ALL'}
          onValueChange={(status) => onChange({ ...value, status: status === 'ALL' ? '' : status })}
        >
          <SelectTrigger>
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {ASSET_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {status.replace(/_/g, ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="mb-2">Category</Label>
        <Select
          value={value.category || 'ALL'}
          onValueChange={(category) => onChange({ ...value, category: category === 'ALL' ? '' : category })}
        >
          <SelectTrigger>
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All categories</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="mb-2">Warranty</Label>
        <Select
          value={value.warranty}
          onValueChange={(warranty: 'all' | 'expiring' | 'expired') => onChange({ ...value, warranty })}
        >
          <SelectTrigger>
            <SelectValue placeholder="All" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="expiring">Expiring (30d)</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label className="mb-2">Assignee</Label>
        <Select
          value={value.assigneeId || 'ALL'}
          onValueChange={(assigneeId) => onChange({ ...value, assigneeId: assigneeId === 'ALL' ? '' : assigneeId })}
        >
          <SelectTrigger>
            <SelectValue placeholder="All assignees" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All assignees</SelectItem>
            {assignees.map((assignee) => (
              <SelectItem key={assignee.id} value={assignee.id}>
                {assignee.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}

