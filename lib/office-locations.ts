// ── Office locations (Country → City) ────────────────────────────────────────
// Assets store a single city string as their `location`. The grouped structure
// drives a hierarchical dropdown; validation and filtering operate on the
// flattened city list. Legacy free-text values ("Karachi Office") are mapped
// back to their canonical city so existing rows keep matching.

export interface OfficeLocationGroup {
  country: string
  cities: string[]
}

export const OFFICE_LOCATIONS: OfficeLocationGroup[] = [
  { country: 'Pakistan', cities: ['Karachi', 'Islamabad', 'Lahore', 'Hyderabad', 'Larkana'] },
  { country: 'Morocco', cities: ['Casablanca', 'Fnideq', 'Kenitra', 'Meknes'] },
  { country: 'United States', cities: ['Dallas'] },
  { country: 'Colombia', cities: ['Pereira'] },
  { country: 'Indonesia', cities: ['Jakarta'] },
]

export const OFFICE_LOCATION_CITIES: string[] = OFFICE_LOCATIONS.flatMap((group) => group.cities)

// Legacy free-text location values mapped to a canonical city.
const LEGACY_LOCATION_ALIASES: Record<string, string> = {
  'karachi office': 'Karachi',
  'islamabad office': 'Islamabad',
  'lahore office': 'Lahore',
  'casablanca office': 'Casablanca',
  'dallas office': 'Dallas',
}

export function isOfficeLocation(value: string | null | undefined): boolean {
  return normalizeOfficeLocation(value) !== null
}

export function normalizeOfficeLocation(input: string | null | undefined): string | null {
  const trimmed = input?.trim()
  if (!trimmed) return null
  const alias = LEGACY_LOCATION_ALIASES[trimmed.toLowerCase()]
  if (alias) return alias
  return OFFICE_LOCATION_CITIES.find((city) => city.toLowerCase() === trimmed.toLowerCase()) || null
}

// All stored values (canonical city + any legacy aliases) that should match a
// given location when filtering, so counts include legacy free-text rows.
export function getOfficeLocationValuesForFilter(location: string | null | undefined): string[] {
  const normalized = normalizeOfficeLocation(location)
  if (!normalized) return []
  const legacyValues = Object.entries(LEGACY_LOCATION_ALIASES)
    .filter(([, target]) => target === normalized)
    .map(([legacy]) => legacy.replace(/\b\w/g, (letter) => letter.toUpperCase()))
  return [normalized, ...legacyValues]
}
