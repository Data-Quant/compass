export function parseCoverPersonIds(value: unknown) {
  if (!Array.isArray(value)) return [] as string[]

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
}

export function normalizeCoverPersonIds(
  coverPersonIds: unknown,
  legacyCoverPersonId?: string | null,
  employeeId?: string | null
) {
  const merged = [...parseCoverPersonIds(coverPersonIds)]

  if (legacyCoverPersonId?.trim()) {
    merged.push(legacyCoverPersonId.trim())
  }

  return [...new Set(merged)].filter((id) => id !== employeeId)
}

export function getPrimaryCoverPersonId(coverPersonIds: string[]) {
  return coverPersonIds[0] ?? null
}
