import { z } from 'zod'
import { normalizeImportedName, resolveImportedName } from '@/lib/mapping-import'
import type { SubscriptionStatus, UserRole } from '@/types'

export const SUBSCRIPTION_STATUSES = ['ACTIVE', 'CANCELED'] as const

export const SUBSCRIPTION_SHEET_NAMES = {
  active: 'Details',
  canceled: 'Canceled Subscriptions',
} as const

const optionalTrimmedString = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return undefined
    if (typeof value !== 'string') return value
    const trimmed = value.trim()
    return trimmed === '' ? undefined : trimmed
  },
  z.string().max(10000).optional()
)

export const subscriptionMutationSchema = z.object({
  name: z.string().trim().min(1).max(200),
  team: optionalTrimmedString,
  usersText: optionalTrimmedString,
  paymentMethodText: optionalTrimmedString,
  purpose: optionalTrimmedString,
  costText: optionalTrimmedString,
  subscriptionTypeText: optionalTrimmedString,
  billedToText: optionalTrimmedString,
  renewalText: optionalTrimmedString,
  noticePeriodText: optionalTrimmedString,
  personInChargeText: optionalTrimmedString,
  lastPaymentText: optionalTrimmedString,
  notes: optionalTrimmedString,
  sourceSheet: optionalTrimmedString,
  status: z.enum(SUBSCRIPTION_STATUSES).default('ACTIVE'),
  ownerIds: z.array(z.string().trim().min(1)).default([]),
})

export const subscriptionStatusMutationSchema = z.object({
  status: z.enum(SUBSCRIPTION_STATUSES),
})

export type SubscriptionMutationPayload = z.infer<typeof subscriptionMutationSchema>

export type SubscriptionImportRow = {
  name: string
  team: string | null
  usersText: string | null
  paymentMethodText: string | null
  purpose: string | null
  costText: string | null
  subscriptionTypeText: string | null
  billedToText: string | null
  renewalText: string | null
  noticePeriodText: string | null
  personInChargeText: string | null
  lastPaymentText: string | null
  notes: string | null
  sourceSheet: string
  status: SubscriptionStatus
}

export type SubscriptionOwnerCandidate = {
  id: string
  name: string
  department?: string | null
  role?: UserRole | string
}

export function normalizeOptionalSubscriptionText(value: string | null | undefined) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function dedupeOwnerIds(ownerIds: string[]) {
  return [...new Set(ownerIds.filter((ownerId) => ownerId.trim().length > 0))]
}

export function splitSubscriptionOwnerText(raw: string | null | undefined) {
  const normalized = normalizeOptionalSubscriptionText(raw)
  if (!normalized) return []

  return normalized
    .replace(/\r/g, '\n')
    .replace(/\band\b/gi, '/')
    .split(/[\/,&;\n]+/)
    .map((token) => token.trim())
    .filter(Boolean)
}

function buildOwnerLookup(users: SubscriptionOwnerCandidate[]) {
  const byExactName = new Map<string, SubscriptionOwnerCandidate>()
  const byFirstName = new Map<string, SubscriptionOwnerCandidate | null>()

  users.forEach((user) => {
    byExactName.set(normalizeImportedName(user.name), user)

    const firstName = normalizeImportedName(user.name.split(/\s+/)[0] || '')
    if (!firstName) return

    const existing = byFirstName.get(firstName)
    if (!existing) {
      byFirstName.set(firstName, user)
    } else if (existing.id !== user.id) {
      byFirstName.set(firstName, null)
    }
  })

  return { byExactName, byFirstName }
}

function resolveOwnerToken(
  token: string,
  lookup: ReturnType<typeof buildOwnerLookup>
) {
  const normalizedToken = normalizeImportedName(resolveImportedName(token))
  if (!normalizedToken) return null

  const exactMatch = lookup.byExactName.get(normalizedToken)
  if (exactMatch) return exactMatch

  const firstNameMatch = lookup.byFirstName.get(normalizedToken)
  if (firstNameMatch) return firstNameMatch

  const fuzzyMatches = [...lookup.byExactName.entries()].filter(([name]) =>
    name.includes(normalizedToken) || normalizedToken.includes(name)
  )

  return fuzzyMatches.length === 1 ? fuzzyMatches[0][1] : null
}

export function resolveSubscriptionOwners(
  rawOwnerText: string | null | undefined,
  users: SubscriptionOwnerCandidate[]
) {
  const normalizedPersonInChargeText = normalizeOptionalSubscriptionText(rawOwnerText)
  const tokens = splitSubscriptionOwnerText(rawOwnerText)
  const lookup = buildOwnerLookup(users)

  const ownerIds: string[] = []
  const unresolvedTokens: string[] = []

  tokens.forEach((token) => {
    const resolved = resolveOwnerToken(token, lookup)
    if (resolved) {
      ownerIds.push(resolved.id)
    } else {
      unresolvedTokens.push(token)
    }
  })

  return {
    ownerIds: dedupeOwnerIds(ownerIds),
    unresolvedTokens,
    normalizedPersonInChargeText,
  }
}
