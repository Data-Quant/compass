import { prisma } from '@/lib/db'
import { OFFICE_WORLD, DEFAULT_DECOR, type DecorChoices } from '@/shared/office-world'
import {
  AVATAR_ACCENT_COLORS,
  AVATAR_ACCESSORIES,
  AVATAR_BODY_FRAMES,
  AVATAR_HAIR_CATEGORIES,
  AVATAR_HAIR_COLORS,
  AVATAR_HEAD_COVERING_TYPES,
  AVATAR_HIJAB_COLORS,
  AVATAR_OUTFIT_COLORS,
  AVATAR_OUTFIT_TYPES,
  getPositionRank,
  hasCompletedOfficeAvatarSetup,
  isDeptLeadEligible,
  isSeniorManagementPosition,
  resolveAvatarV2Settings,
} from '@/shared/avatar-v2'

type OfficeUser = {
  id: string
  name: string
  department?: string | null
  position?: string | null
  avatarSkinTone?: string | null
  avatarSchemaVersion?: number | null
  avatarBodyFrame?: string | null
  avatarOutfitType?: string | null
  avatarOutfitColor?: string | null
  avatarOutfitAccentColor?: string | null
  avatarHairCategory?: string | null
  avatarHairColor?: string | null
  avatarHeadCoveringType?: string | null
  avatarHeadCoveringColor?: string | null
  avatarAccessories?: unknown
}

function hashString(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

/**
 * Picks a deterministic cubicle for a user inside their department's wing.
 * Falls back to any open cubicle if the user has no department or their
 * department string doesn't map to a wing in the world.
 */
export function getDefaultCubicleId(userId: string, department?: string | null) {
  const wingCubicles = department
    ? OFFICE_WORLD.cubicles.filter((c) => c.department === department)
    : []
  const pool = wingCubicles.length > 0 ? wingCubicles : OFFICE_WORLD.cubicles
  return pool[hashString(userId) % pool.length]?.id || pool[0]?.id || null
}

export function getDefaultLeadershipOfficeId(userId: string) {
  // Partner-and-up offices in the leadership wing — does NOT include dept
  // lead offices (those are auto-assigned via resolveDeptLeadAssignments).
  const offices = OFFICE_WORLD.leadershipOffices.filter((o) => o.id.startsWith('partner-'))
  if (offices.length === 0) return null
  return offices[hashString(userId) % offices.length]?.id || offices[0]?.id
}

export function getAvatarCatalog() {
  return {
    bodyFrames: AVATAR_BODY_FRAMES,
    outfitTypes: AVATAR_OUTFIT_TYPES,
    hairCategories: AVATAR_HAIR_CATEGORIES,
    headCoveringTypes: AVATAR_HEAD_COVERING_TYPES,
    accessories: AVATAR_ACCESSORIES,
    outfitColors: AVATAR_OUTFIT_COLORS,
    accentColors: AVATAR_ACCENT_COLORS,
    hairColors: AVATAR_HAIR_COLORS,
    hijabColors: AVATAR_HIJAB_COLORS,
  }
}

export function getDecorCatalog() {
  return {
    cubicleThemes: ['plutus-blue', 'deep-focus', 'warm-wood', 'clean-slate'],
    deskItems: ['plant', 'notebook', 'monitor', 'coffee', 'award'],
    wallItems: ['plutus-poster', 'team-photo', 'whiteboard', 'market-chart'],
  }
}

export function resolveOfficeIdentity(user: OfficeUser, assignment?: {
  cubicleId?: string | null
  leadershipOfficeId?: string | null
  eligibilityOverride?: boolean | null
}) {
  const positionEligible = isSeniorManagementPosition(user.position)
  const seniorOfficeEligible = assignment?.eligibilityOverride ?? positionEligible
  const cubicleId = assignment?.cubicleId || getDefaultCubicleId(user.id, user.department)
  const leadershipOfficeId =
    seniorOfficeEligible
      ? assignment?.leadershipOfficeId || getDefaultLeadershipOfficeId(user.id)
      : null

  return {
    cubicleId,
    leadershipOfficeId,
    seniorOfficeEligible,
    avatar: resolveAvatarV2Settings(user.id, user as any),
  }
}

// ─── Office directory ───────────────────────────────────────────────────────
// Computes a stable mapping for "who sits where" so the client can render
// nameplates over each cubicle desk and dept lead office. Explicit
// OfficeCubicleAssignment / OfficeLeadershipOfficeAssignment rows always win
// over the auto-derived defaults.

export type OfficeDirectoryEntry = {
  userId: string
  name: string
  position: string | null
  department: string | null
  decor: DecorChoices
}

function parseDecor(value: unknown): DecorChoices {
  if (!value || typeof value !== 'object') return DEFAULT_DECOR
  const v = value as Partial<DecorChoices>
  return {
    theme: v.theme ?? DEFAULT_DECOR.theme,
    deskItems: Array.isArray(v.deskItems) ? v.deskItems : [],
    wallItem: v.wallItem ?? null,
  }
}

export type OfficeDirectory = {
  /** cubicleId → who sits there */
  cubicleAssignments: Record<string, OfficeDirectoryEntry>
  /** dept lead office id (e.g. "lead-quant") → assignee */
  leadOfficeAssignments: Record<string, OfficeDirectoryEntry>
  /** partner office id → assignee (senior management offices in the leadership wing) */
  partnerOfficeAssignments: Record<string, OfficeDirectoryEntry>
}

/**
 * Builds the office directory from current DB state. Runs on bootstrap only;
 * cheap enough for the company's user count.
 *
 * Auto-derivation rules (HR can override any of these by writing explicit
 * OfficeCubicleAssignment / OfficeLeadershipOfficeAssignment rows):
 *
 * - Each department's most senior lead-eligible user (rank ≤ 12, hire date
 *   tiebreaker) gets that department's lead office.
 * - Anyone who is senior management (partner+) gets a partner office in the
 *   leadership wing — round-robin by user id hash.
 * - Everyone else gets a deterministic cubicle inside their department's wing.
 */
export async function buildOfficeDirectory(): Promise<OfficeDirectory> {
  const [users, explicitCubicles, explicitLeadOffices] = await Promise.all([
    prisma.user.findMany({
      where: {
        OR: [
          { payrollProfile: null },
          { payrollProfile: { isPayrollActive: true } },
        ],
      },
      select: {
        id: true,
        name: true,
        position: true,
        department: true,
        createdAt: true,
      },
    }),
    prisma.officeCubicleAssignment.findMany(),
    prisma.officeLeadershipOfficeAssignment.findMany(),
  ])

  const userById = new Map(users.map((u) => [u.id, u]))

  const cubicleAssignments: Record<string, OfficeDirectoryEntry> = {}
  const leadOfficeAssignments: Record<string, OfficeDirectoryEntry> = {}
  const partnerOfficeAssignments: Record<string, OfficeDirectoryEntry> = {}

  // Explicit cubicle assignments first — pull through any saved decor.
  const cubicleAssignedUserIds = new Set<string>()
  for (const assignment of explicitCubicles) {
    const u = userById.get(assignment.userId)
    if (!u) continue
    cubicleAssignments[assignment.cubicleId] = entryFor(u, parseDecor(assignment.decorJson))
    cubicleAssignedUserIds.add(u.id)
  }

  // Explicit lead/partner assignments.
  const leadOfficeAssignedUserIds = new Set<string>()
  for (const assignment of explicitLeadOffices) {
    const u = userById.get(assignment.userId)
    if (!u) continue
    const decor = parseDecor(assignment.decorJson)
    if (assignment.officeId.startsWith('lead-')) {
      leadOfficeAssignments[assignment.officeId] = entryFor(u, decor)
    } else if (assignment.officeId.startsWith('partner-')) {
      partnerOfficeAssignments[assignment.officeId] = entryFor(u, decor)
    }
    leadOfficeAssignedUserIds.add(u.id)
  }

  // Auto-derive: per department, pick the lead-eligible user with the
  // lowest position rank (most senior). Hire date is the tiebreaker.
  const usersByDepartment = new Map<string, typeof users>()
  for (const u of users) {
    if (!u.department) continue
    const list = usersByDepartment.get(u.department) || []
    list.push(u)
    usersByDepartment.set(u.department, list)
  }

  for (const wing of OFFICE_WORLD.leadershipOffices) {
    if (!wing.id.startsWith('lead-') || !wing.department) continue
    if (leadOfficeAssignments[wing.id]) continue // explicit assignment wins
    const candidates = (usersByDepartment.get(wing.department) || [])
      .filter((u) => isDeptLeadEligible(u.position) && !leadOfficeAssignedUserIds.has(u.id))
      .sort((a, b) => {
        const rankDiff = getPositionRank(a.position) - getPositionRank(b.position)
        if (rankDiff !== 0) return rankDiff
        return a.createdAt.getTime() - b.createdAt.getTime()
      })
    const lead = candidates[0]
    if (lead) {
      leadOfficeAssignments[wing.id] = entryFor(lead)
      leadOfficeAssignedUserIds.add(lead.id)
    }
  }

  // Auto-assign partner offices to senior management who don't already have one.
  const seniorUsers = users
    .filter((u) => isSeniorManagementPosition(u.position) && !leadOfficeAssignedUserIds.has(u.id))
    .sort((a, b) => {
      const rankDiff = getPositionRank(a.position) - getPositionRank(b.position)
      if (rankDiff !== 0) return rankDiff
      return a.createdAt.getTime() - b.createdAt.getTime()
    })
  const partnerOffices = OFFICE_WORLD.leadershipOffices.filter((o) => o.id.startsWith('partner-'))
  let partnerIdx = 0
  for (const u of seniorUsers) {
    if (partnerIdx >= partnerOffices.length) break
    const office = partnerOffices[partnerIdx]
    if (!partnerOfficeAssignments[office.id]) {
      partnerOfficeAssignments[office.id] = entryFor(u)
      partnerIdx += 1
    } else {
      partnerIdx += 1
    }
  }

  // Auto-assign cubicles for everyone else (skip those already in a lead/partner office).
  // Within each wing, distribute users round-robin so two people don't land on
  // the same desk when both have the same hash modulo.
  const usedCubiclesByDept = new Map<string, Set<string>>()
  for (const cubicleId of Object.keys(cubicleAssignments)) {
    const cubicle = OFFICE_WORLD.cubicles.find((c) => c.id === cubicleId)
    if (!cubicle) continue
    const used = usedCubiclesByDept.get(cubicle.department) || new Set<string>()
    used.add(cubicle.id)
    usedCubiclesByDept.set(cubicle.department, used)
  }

  for (const u of users) {
    if (cubicleAssignedUserIds.has(u.id)) continue
    if (leadOfficeAssignedUserIds.has(u.id)) continue
    if (Object.values(partnerOfficeAssignments).some((a) => a.userId === u.id)) continue
    if (!u.department) continue

    const wingCubicles = OFFICE_WORLD.cubicles.filter((c) => c.department === u.department)
    if (wingCubicles.length === 0) continue

    const used = usedCubiclesByDept.get(u.department) || new Set<string>()
    const open = wingCubicles.filter((c) => !used.has(c.id))
    if (open.length === 0) continue

    const cubicle = open[hashString(u.id) % open.length]
    cubicleAssignments[cubicle.id] = entryFor(u)
    used.add(cubicle.id)
    usedCubiclesByDept.set(u.department, used)
  }

  return { cubicleAssignments, leadOfficeAssignments, partnerOfficeAssignments }
}

function entryFor(
  user: { id: string; name: string; position: string | null; department: string | null },
  decor: DecorChoices = DEFAULT_DECOR,
): OfficeDirectoryEntry {
  return {
    userId: user.id,
    name: user.name,
    position: user.position,
    department: user.department,
    decor,
  }
}

export async function getOfficeBootstrapForUser(user: OfficeUser) {
  const [preference, cubicleAssignment, leadershipAssignment, roomMetadata, catalogItems, directory] =
    await Promise.all([
      prisma.officeUserPreference.findUnique({ where: { userId: user.id } }),
      prisma.officeCubicleAssignment.findUnique({ where: { userId: user.id } }),
      prisma.officeLeadershipOfficeAssignment.findUnique({ where: { userId: user.id } }),
      prisma.officeRoomMetadata.findMany(),
      prisma.officeCatalogItem.findMany({ where: { isActive: true } }),
      buildOfficeDirectory(),
    ])

  // The directory is the source of truth for "who sits where" — fall back to
  // it if the user's own row doesn't have an explicit assignment yet.
  const myCubicleFromDirectory = Object.entries(directory.cubicleAssignments)
    .find(([, entry]) => entry.userId === user.id)?.[0] ?? null
  const myLeadOfficeFromDirectory = Object.entries(directory.leadOfficeAssignments)
    .find(([, entry]) => entry.userId === user.id)?.[0] ?? null
  const myPartnerOfficeFromDirectory = Object.entries(directory.partnerOfficeAssignments)
    .find(([, entry]) => entry.userId === user.id)?.[0] ?? null

  const identity = resolveOfficeIdentity(user, {
    cubicleId: cubicleAssignment?.cubicleId ?? myCubicleFromDirectory,
    leadershipOfficeId:
      leadershipAssignment?.officeId ?? myLeadOfficeFromDirectory ?? myPartnerOfficeFromDirectory,
    eligibilityOverride: leadershipAssignment?.eligibilityOverride,
  })

  return {
    world: OFFICE_WORLD,
    branding: OFFICE_WORLD.branding,
    assignment: {
      cubicleId: identity.cubicleId,
      leadershipOfficeId: identity.leadershipOfficeId,
      seniorOfficeEligible: identity.seniorOfficeEligible,
      savedCubicleAssignment: cubicleAssignment,
      savedLeadershipOfficeAssignment: leadershipAssignment,
    },
    avatarNeedsSetup: !hasCompletedOfficeAvatarSetup(user as any),
    avatar: identity.avatar,
    preference,
    roomMetadata,
    directory,
    catalog: {
      avatar: getAvatarCatalog(),
      decor: getDecorCatalog(),
      admin: catalogItems,
    },
    serverUrl: process.env.NEXT_PUBLIC_OFFICE_SERVER_URL || 'ws://localhost:2567',
    livekitConfigured: Boolean(process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET),
  }
}
