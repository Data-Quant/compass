export const AVATAR_BODY_FRAMES = ['masculine', 'feminine'] as const
export type AvatarBodyFrame = (typeof AVATAR_BODY_FRAMES)[number]

export const AVATAR_OUTFIT_TYPES = [
  'shirt',
  'blazer',
  'hoodie',
  'kurta',
  'suit',
] as const
export type AvatarOutfitType = (typeof AVATAR_OUTFIT_TYPES)[number]

export const AVATAR_HAIR_CATEGORIES = [
  'short',
  'medium',
  'long',
  'tied',
  'curly',
  'covered',
] as const
export type AvatarHairCategory = (typeof AVATAR_HAIR_CATEGORIES)[number]

export const AVATAR_HEAD_COVERING_TYPES = ['none', 'hijab'] as const
export type AvatarHeadCoveringType = (typeof AVATAR_HEAD_COVERING_TYPES)[number]

export const AVATAR_ACCESSORIES = ['glasses', 'badge', 'watch'] as const
export type AvatarAccessory = (typeof AVATAR_ACCESSORIES)[number]

export const AVATAR_OUTFIT_COLORS = [
  '#2563eb',
  '#4f46e5',
  '#7c3aed',
  '#db2777',
  '#dc2626',
  '#ea580c',
  '#ca8a04',
  '#16a34a',
  '#0891b2',
  '#334155',
  '#111827',
] as const

export const AVATAR_ACCENT_COLORS = [
  '#f8fafc',
  '#dbeafe',
  '#fef3c7',
  '#dcfce7',
  '#fee2e2',
  '#e0e7ff',
  '#f5d0fe',
] as const

export const AVATAR_HIJAB_COLORS = [
  '#111827',
  '#334155',
  '#475569',
  '#7f1d1d',
  '#92400e',
  '#581c87',
  '#0f766e',
  '#f8fafc',
] as const

export type AvatarV2Settings = {
  avatarSchemaVersion: number | null
  avatarBodyFrame: AvatarBodyFrame | null
  avatarOutfitType: AvatarOutfitType | null
  avatarOutfitColor: string | null
  avatarOutfitAccentColor: string | null
  avatarHairCategory: AvatarHairCategory | null
  avatarHeadCoveringType: AvatarHeadCoveringType | null
  avatarHeadCoveringColor: string | null
  avatarAccessories: AvatarAccessory[] | null
}

// avatarSkinTone is the only carryover from the v1 schema; v2 still uses it.
export type LegacyAvatarSettings = {
  avatarSkinTone?: string | null
}

function hashString(value: string, salt = 0) {
  let hash = salt
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

function pick<T extends readonly string[]>(items: T, seed: string, salt: number): T[number] {
  return items[hashString(seed, salt) % items.length]
}

export function normalizeAvatarAccessories(value: unknown): AvatarAccessory[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is AvatarAccessory =>
    AVATAR_ACCESSORIES.includes(item as AvatarAccessory)
  )
}

export function resolveAvatarV2Settings(
  seed: string,
  avatar: Partial<AvatarV2Settings & LegacyAvatarSettings>
) {
  const hasSavedV2 = hasCompletedOfficeAvatarSetup(avatar)
  const bodyFrame =
    hasSavedV2 && avatar.avatarBodyFrame && AVATAR_BODY_FRAMES.includes(avatar.avatarBodyFrame)
      ? avatar.avatarBodyFrame
      : pick(AVATAR_BODY_FRAMES, seed, 11)
  const headCoveringType =
    hasSavedV2 && avatar.avatarHeadCoveringType && AVATAR_HEAD_COVERING_TYPES.includes(avatar.avatarHeadCoveringType)
      ? avatar.avatarHeadCoveringType
      : 'none'

  return {
    avatarSchemaVersion: 2,
    avatarBodyFrame: bodyFrame,
    avatarOutfitType:
      hasSavedV2 && avatar.avatarOutfitType && AVATAR_OUTFIT_TYPES.includes(avatar.avatarOutfitType)
        ? avatar.avatarOutfitType
        : bodyFrame === 'feminine'
          ? pick(['shirt', 'blazer', 'kurta'] as const, seed, 13)
          : pick(['shirt', 'blazer', 'hoodie', 'suit'] as const, seed, 17),
    avatarOutfitColor:
      hasSavedV2 && avatar.avatarOutfitColor
        ? avatar.avatarOutfitColor
        : pick(AVATAR_OUTFIT_COLORS, seed, 19),
    avatarOutfitAccentColor:
      hasSavedV2 && avatar.avatarOutfitAccentColor
        ? avatar.avatarOutfitAccentColor
        : pick(AVATAR_ACCENT_COLORS, seed, 23),
    avatarHairCategory:
      headCoveringType === 'hijab'
        ? 'covered'
        : hasSavedV2 && avatar.avatarHairCategory && AVATAR_HAIR_CATEGORIES.includes(avatar.avatarHairCategory)
          ? avatar.avatarHairCategory
          : bodyFrame === 'feminine'
            ? pick(['medium', 'long', 'tied', 'curly'] as const, seed, 29)
            : pick(['short', 'medium', 'curly'] as const, seed, 31),
    avatarHeadCoveringType: headCoveringType,
    avatarHeadCoveringColor:
      hasSavedV2 && avatar.avatarHeadCoveringColor
        ? avatar.avatarHeadCoveringColor
        : pick(AVATAR_HIJAB_COLORS, seed, 37),
    avatarAccessories: hasSavedV2 ? normalizeAvatarAccessories(avatar.avatarAccessories) : [],
  } satisfies Required<AvatarV2Settings>
}

export function hasCompletedOfficeAvatarSetup(avatar: Partial<AvatarV2Settings & LegacyAvatarSettings>) {
  return Boolean(
    avatar.avatarBodyFrame &&
    avatar.avatarOutfitType &&
    avatar.avatarOutfitColor &&
    avatar.avatarOutfitAccentColor &&
    avatar.avatarHairCategory &&
    avatar.avatarHeadCoveringType &&
    avatar.avatarSkinTone
  )
}

export function isSeniorManagementPosition(position: string | null | undefined) {
  const normalized = (position || '').trim().toLowerCase()
  if (!normalized) return false

  return [
    'junior partner',
    'principal and junior partner',
    'partner',
    'managing partner',
    'operating partner',
    'chief ',
    'ceo',
    'cto',
    'cfo',
    'coo',
  ].some((marker) => normalized.includes(marker))
}
