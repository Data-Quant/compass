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

// ── Predefined asset categories ────────────────────────────────────────────
// Each category carries the QR/ID prefix used by category-based asset IDs and a
// `hasSpecs` flag marking categories that capture hardware specs (laptops).
export interface AssetCategoryMeta {
  value: string
  label: string
  idPrefix: string
  hasSpecs: boolean
}

export const ASSET_CATEGORIES: AssetCategoryMeta[] = [
  { value: 'Laptops', label: 'Laptops', idPrefix: 'LAP', hasSpecs: true },
  { value: 'Mobile Phones', label: 'Mobile Phones', idPrefix: 'MOB', hasSpecs: false },
  { value: 'External Monitors', label: 'External Monitors', idPrefix: 'MON', hasSpecs: false },
  { value: 'YubiKeys', label: 'YubiKeys', idPrefix: 'YUB', hasSpecs: false },
  { value: 'Mouse', label: 'Mouse', idPrefix: 'MOU', hasSpecs: false },
  { value: 'Bag', label: 'Bag', idPrefix: 'BAG', hasSpecs: false },
  { value: 'Headphones / Earphones', label: 'Headphones / Earphones', idPrefix: 'AUD', hasSpecs: false },
  { value: 'Other Accessories', label: 'Other Accessories', idPrefix: 'ACC', hasSpecs: false },
]

export const ASSET_CATEGORY_VALUES: string[] = ASSET_CATEGORIES.map((category) => category.value)
export const DEFAULT_ASSET_CATEGORY = 'Other Accessories'

export function getAssetCategoryMeta(value: string | null | undefined): AssetCategoryMeta | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  return ASSET_CATEGORIES.find((category) => category.value.toLowerCase() === trimmed.toLowerCase()) || null
}

export function isAssetCategory(value: string | null | undefined): boolean {
  return getAssetCategoryMeta(value) !== null
}

export function assetCategoryHasSpecs(value: string | null | undefined): boolean {
  return Boolean(getAssetCategoryMeta(value)?.hasSpecs)
}

// ── Purchase type ───────────────────────────────────────────────────────────
export const PURCHASE_TYPES = ['Brand New', 'Refurbished', 'Used'] as const
export type PurchaseType = (typeof PURCHASE_TYPES)[number]

export function isPurchaseType(value: string | null | undefined): value is PurchaseType {
  return PURCHASE_TYPES.includes((value?.trim() || '') as PurchaseType)
}

export function normalizePurchaseType(value: string | null | undefined): PurchaseType | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  return PURCHASE_TYPES.find((type) => type.toLowerCase() === trimmed.toLowerCase()) || null
}

// ── Laptop hardware specs (stored in EquipmentAsset.specsJson) ───────────────
export interface LaptopSpecs {
  processor: string
  ram: string
  storage: string
}

/** Coerce arbitrary specsJson into a LaptopSpecs, or null when empty/invalid. */
export function normalizeLaptopSpecs(raw: unknown): LaptopSpecs | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const processor = String(record.processor ?? '').trim()
  const ram = String(record.ram ?? '').trim()
  const storage = String(record.storage ?? '').trim()
  if (!processor && !ram && !storage) return null
  return { processor, ram, storage }
}

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

