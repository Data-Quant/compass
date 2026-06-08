export const ASSET_STATUSES = [
  'IN_STOCK',
  'ASSIGNED',
  'IN_REPAIR',
  'RETIRED',
  'LOST',
  'DISPOSED',
] as const

export const ASSET_CONDITIONS = ['NEW', 'GOOD', 'FAIR', 'DAMAGED'] as const

export const ASSET_LOCATIONS = [
  'Karachi',
  'Islamabad',
  'Lahore',
  'Casablanca',
  'Dallas',
] as const

export type AssetStatus = (typeof ASSET_STATUSES)[number]
export type AssetCondition = (typeof ASSET_CONDITIONS)[number]
export type AssetLocation = (typeof ASSET_LOCATIONS)[number]
export type WarrantyState = 'NONE' | 'VALID' | 'EXPIRING' | 'EXPIRED'

const ASSIGNMENT_BLOCKED_STATUSES = new Set<AssetStatus>(['RETIRED', 'LOST', 'DISPOSED'])
const EQUIPMENT_ID_PREFIX = 'EQUIP'
const EQUIPMENT_ID_START = 101
const LEGACY_LOCATION_ALIASES: Record<string, AssetLocation> = {
  'karachi office': 'Karachi',
  'islamabad office': 'Islamabad',
  'lahore office': 'Lahore',
  'casablanca office': 'Casablanca',
  'dallas office': 'Dallas',
}

export function normalizeEquipmentId(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '-')
}

export function isAssetLocation(value: string | null | undefined): value is AssetLocation {
  return ASSET_LOCATIONS.includes(value as AssetLocation) || Boolean(LEGACY_LOCATION_ALIASES[value?.trim().toLowerCase() || ''])
}

export function normalizeAssetLocation(input: string | null | undefined): AssetLocation | null {
  const trimmed = input?.trim()
  if (!trimmed) return null
  const alias = LEGACY_LOCATION_ALIASES[trimmed.toLowerCase()]
  if (alias) return alias
  return ASSET_LOCATIONS.find((location) => location.toLowerCase() === trimmed.toLowerCase()) || null
}

export function getAssetLocationValuesForFilter(location: string | null | undefined) {
  const normalized = normalizeAssetLocation(location)
  if (!normalized) return []
  const legacyValues = Object.entries(LEGACY_LOCATION_ALIASES)
    .filter(([, target]) => target === normalized)
    .map(([legacy]) => legacy.replace(/\b\w/g, (letter) => letter.toUpperCase()))
  return [normalized, ...legacyValues]
}

export function getNextEquipmentId(existingEquipmentIds: Array<string | null | undefined>) {
  let highest = EQUIPMENT_ID_START - 1

  for (const value of existingEquipmentIds) {
    const match = normalizeEquipmentId(value || '').match(/^EQUIP-(\d+)$/)
    if (!match) continue
    const numeric = Number(match[1])
    if (Number.isFinite(numeric)) highest = Math.max(highest, numeric)
  }

  const next = highest + 1
  return `${EQUIPMENT_ID_PREFIX}-${String(next).padStart(3, '0')}`
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

