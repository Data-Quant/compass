import { prisma } from '@/lib/db'
import { OFFICE_WORLD } from '@/shared/office-world'
import {
  AVATAR_ACCENT_COLORS,
  AVATAR_ACCESSORIES,
  AVATAR_BODY_FRAMES,
  AVATAR_HAIR_CATEGORIES,
  AVATAR_HEAD_COVERING_TYPES,
  AVATAR_HIJAB_COLORS,
  AVATAR_OUTFIT_COLORS,
  AVATAR_OUTFIT_TYPES,
  hasCompletedOfficeAvatarSetup,
  isSeniorManagementPosition,
  resolveAvatarV2Settings,
} from '@/shared/avatar-v2'

type OfficeUser = {
  id: string
  name: string
  position?: string | null
  avatarSkinTone?: string | null
  avatarSchemaVersion?: number | null
  avatarBodyFrame?: string | null
  avatarOutfitType?: string | null
  avatarOutfitColor?: string | null
  avatarOutfitAccentColor?: string | null
  avatarHairCategory?: string | null
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

export function getDefaultCubicleId(userId: string) {
  const cubicles = OFFICE_WORLD.cubicles
  return cubicles[hashString(userId) % cubicles.length]?.id || cubicles[0]?.id || null
}

export function getDefaultLeadershipOfficeId(userId: string) {
  const offices = OFFICE_WORLD.leadershipOffices
  return offices[hashString(userId) % offices.length]?.id || offices[0]?.id || null
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
  const cubicleId = assignment?.cubicleId || getDefaultCubicleId(user.id)
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

export async function getOfficeBootstrapForUser(user: OfficeUser) {
  const [preference, cubicleAssignment, leadershipAssignment, roomMetadata, catalogItems] =
    await Promise.all([
      prisma.officeUserPreference.findUnique({ where: { userId: user.id } }),
      prisma.officeCubicleAssignment.findUnique({ where: { userId: user.id } }),
      prisma.officeLeadershipOfficeAssignment.findUnique({ where: { userId: user.id } }),
      prisma.officeRoomMetadata.findMany(),
      prisma.officeCatalogItem.findMany({ where: { isActive: true } }),
    ])

  const identity = resolveOfficeIdentity(user, {
    cubicleId: cubicleAssignment?.cubicleId,
    leadershipOfficeId: leadershipAssignment?.officeId,
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
    catalog: {
      avatar: getAvatarCatalog(),
      decor: getDecorCatalog(),
      admin: catalogItems,
    },
    serverUrl: process.env.NEXT_PUBLIC_OFFICE_SERVER_URL || 'ws://localhost:2567',
    livekitConfigured: Boolean(process.env.LIVEKIT_API_KEY && process.env.LIVEKIT_API_SECRET),
  }
}
