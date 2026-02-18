export const ASSET_STATUSES = [
  'IN_STOCK',
  'ASSIGNED',
  'IN_REPAIR',
  'RETIRED',
  'LOST',
  'DISPOSED',
] as const

export const ASSET_CONDITIONS = ['NEW', 'GOOD', 'FAIR', 'DAMAGED'] as const

export type AssetStatus = (typeof ASSET_STATUSES)[number]
export type AssetCondition = (typeof ASSET_CONDITIONS)[number]
export type WarrantyState = 'NONE' | 'VALID' | 'EXPIRING' | 'EXPIRED'

const ASSIGNMENT_BLOCKED_STATUSES = new Set<AssetStatus>(['RETIRED', 'LOST', 'DISPOSED'])

export function normalizeEquipmentId(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '-')
}

export function canAssignInStatus(status: AssetStatus): boolean {
  return !ASSIGNMENT_BLOCKED_STATUSES.has(status)
}

export function getWarrantyState(
  warrantyEndDate: Date | string | null | undefined,
  referenceDate: Date = new Date(),
  expiringWindowDays = 30
): WarrantyState {
  if (!warrantyEndDate) return 'NONE'

  const end = new Date(warrantyEndDate)
  if (Number.isNaN(end.getTime())) return 'NONE'

  const today = new Date(referenceDate)
  today.setHours(0, 0, 0, 0)
  end.setHours(0, 0, 0, 0)

  if (end.getTime() < today.getTime()) {
    return 'EXPIRED'
  }

  const threshold = new Date(today)
  threshold.setDate(threshold.getDate() + expiringWindowDays)

  if (end.getTime() <= threshold.getTime()) {
    return 'EXPIRING'
  }

  return 'VALID'
}

export function parseNullableDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === '') return null
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return null
  return date
}

export function parseNullableNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''))
  if (!Number.isFinite(parsed)) return null
  return parsed
}

export function ensureWarrantyDateOrder(
  purchaseDate: Date | null,
  warrantyEndDate: Date | null
): string | null {
  if (!purchaseDate || !warrantyEndDate) return null
  if (warrantyEndDate.getTime() < purchaseDate.getTime()) {
    return 'warrantyEndDate cannot be earlier than purchaseDate'
  }
  return null
}

