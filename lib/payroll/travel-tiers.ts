/**
 * Pure helpers for editing travel allowance tiers in place.
 *
 * The settings table edits a tier as a row of input strings; these helpers
 * turn a saved tier into that draft and a draft back into a validated PATCH
 * body containing only the fields that changed. No I/O.
 */

export const TRANSPORT_MODES = ['CAR', 'BIKE', 'PUBLIC_TRANSPORT'] as const
export type TransportMode = (typeof TRANSPORT_MODES)[number]

export interface TravelTierRecord {
  id: string
  transportMode: TransportMode
  minKm: number
  maxKm: number | null
  monthlyRate: number
  /** ISO date-time as returned by the API. */
  effectiveFrom: string
  effectiveTo: string | null
  isActive: boolean
}

/** Row editor state: every field as the string an <input> holds. */
export interface TravelTierDraft {
  transportMode: string
  minKm: string
  maxKm: string
  monthlyRate: string
  /** yyyy-mm-dd, as a date input holds it. */
  effectiveFrom: string
  effectiveTo: string
  isActive: boolean
}

export interface TravelTierPatch {
  transportMode?: TransportMode
  minKm?: number
  maxKm?: number | null
  monthlyRate?: number
  effectiveFrom?: string
  effectiveTo?: string | null
  isActive?: boolean
}

export type TravelTierPatchResult =
  | { ok: true; patch: TravelTierPatch }
  | { ok: false; error: string }

function isoToDateInput(value: string | null): string {
  return value ? value.slice(0, 10) : ''
}

export function toTravelTierDraft(tier: TravelTierRecord): TravelTierDraft {
  return {
    transportMode: tier.transportMode,
    minKm: String(tier.minKm),
    maxKm: tier.maxKm === null ? '' : String(tier.maxKm),
    monthlyRate: String(tier.monthlyRate),
    effectiveFrom: isoToDateInput(tier.effectiveFrom),
    effectiveTo: isoToDateInput(tier.effectiveTo),
    isActive: tier.isActive,
  }
}

function parseNonNegative(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const n = Number(trimmed)
  return Number.isFinite(n) && n >= 0 ? n : null
}

function isTransportMode(value: string): value is TransportMode {
  return (TRANSPORT_MODES as readonly string[]).includes(value)
}

/**
 * Validates the draft and returns a PATCH body holding only the fields that
 * differ from the saved tier. An unchanged draft yields an empty patch so the
 * caller can skip the request.
 */
export function buildTravelTierPatch(tier: TravelTierRecord, draft: TravelTierDraft): TravelTierPatchResult {
  if (!isTransportMode(draft.transportMode)) {
    return { ok: false, error: 'Choose a transport mode.' }
  }

  const minKm = parseNonNegative(draft.minKm)
  if (minKm === null) return { ok: false, error: 'Min KM must be a number of 0 or more.' }

  const maxKmBlank = draft.maxKm.trim() === ''
  const maxKm = maxKmBlank ? null : parseNonNegative(draft.maxKm)
  if (!maxKmBlank && maxKm === null) return { ok: false, error: 'Max KM must be a number of 0 or more, or blank for no limit.' }
  if (maxKm !== null && maxKm < minKm) return { ok: false, error: 'Max KM must be at least Min KM.' }

  const monthlyRate = parseNonNegative(draft.monthlyRate)
  if (monthlyRate === null) return { ok: false, error: 'Monthly rate must be a number of 0 or more.' }

  const effectiveFrom = draft.effectiveFrom.trim()
  if (!effectiveFrom) return { ok: false, error: 'Effective from is required.' }

  const effectiveTo = draft.effectiveTo.trim()
  if (effectiveTo && effectiveTo < effectiveFrom) {
    return { ok: false, error: 'Effective to must be on or after effective from.' }
  }

  const patch: TravelTierPatch = {}
  if (draft.transportMode !== tier.transportMode) patch.transportMode = draft.transportMode
  if (minKm !== tier.minKm) patch.minKm = minKm
  if (maxKm !== tier.maxKm) patch.maxKm = maxKm
  if (monthlyRate !== tier.monthlyRate) patch.monthlyRate = monthlyRate
  if (effectiveFrom !== isoToDateInput(tier.effectiveFrom)) patch.effectiveFrom = effectiveFrom
  if (effectiveTo !== isoToDateInput(tier.effectiveTo)) patch.effectiveTo = effectiveTo || null
  if (draft.isActive !== tier.isActive) patch.isActive = draft.isActive

  return { ok: true, patch }
}
