import type { AssetCondition, AssetStatus } from '@/lib/asset-utils'

export interface AssetAssignee {
  id: string
  name: string
  department: string | null
  position: string | null
  email?: string | null
}

export interface AssetItem {
  id: string
  equipmentId: string
  assetName: string
  category: string
  brand: string | null
  model: string | null
  serialNumber: string | null
  specsJson: unknown | null
  purchaseCost: number | null
  purchaseCurrency: string
  purchaseDate: string | null
  warrantyStartDate: string | null
  warrantyEndDate: string | null
  vendor: string | null
  status: AssetStatus
  condition: AssetCondition
  location: string | null
  notes: string | null
  currentAssigneeId: string | null
  currentAssignee?: AssetAssignee | null
  createdAt: string
  updatedAt: string
  _count?: {
    assignments: number
    events: number
  }
}

export interface AssetAssignment {
  id: string
  assignedAt: string
  unassignedAt: string | null
  assignmentNote: string | null
  returnNote: string | null
  employee: AssetAssignee
  assignedBy: { id: string; name: string; role: string }
  unassignedBy: { id: string; name: string; role: string } | null
}

export interface AssetEvent {
  id: string
  eventType: string
  payloadJson: unknown | null
  createdAt: string
  actor: { id: string; name: string; role: string } | null
}

export interface AssetFiltersState {
  q: string
  status: string
  category: string
  assigneeId: string
  warranty: 'all' | 'expiring' | 'expired'
}

