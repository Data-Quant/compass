import jwt from 'jsonwebtoken'

const OFFICE_JWT_SECRET = process.env.OFFICE_JWT_SECRET || 'dev-office-secret-change-me'

export interface OfficeTokenPayload {
  userId: string
  name: string
  department: string | null
  position: string | null
  role: string
  avatarSkinTone: string | null
  avatarSchemaVersion: number | null
  avatarBodyFrame: string | null
  avatarOutfitType: string | null
  avatarOutfitColor: string | null
  avatarOutfitAccentColor: string | null
  avatarHairCategory: string | null
  avatarHairColor: string | null
  avatarHeadCoveringType: string | null
  avatarHeadCoveringColor: string | null
  avatarAccessories: unknown
  cubicleId?: string | null
  leadershipOfficeId?: string | null
  seniorOfficeEligible?: boolean
}

export function generateOfficeToken(user: {
  id: string
  name: string
  department?: string | null
  position?: string | null
  role: string
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
  cubicleId?: string | null
  leadershipOfficeId?: string | null
  seniorOfficeEligible?: boolean
}): string {
  const payload: OfficeTokenPayload = {
    userId: user.id,
    name: user.name,
    department: user.department ?? null,
    position: user.position ?? null,
    role: user.role,
    avatarSkinTone: user.avatarSkinTone ?? null,
    avatarSchemaVersion: user.avatarSchemaVersion ?? null,
    avatarBodyFrame: user.avatarBodyFrame ?? null,
    avatarOutfitType: user.avatarOutfitType ?? null,
    avatarOutfitColor: user.avatarOutfitColor ?? null,
    avatarOutfitAccentColor: user.avatarOutfitAccentColor ?? null,
    avatarHairCategory: user.avatarHairCategory ?? null,
    avatarHairColor: user.avatarHairColor ?? null,
    avatarHeadCoveringType: user.avatarHeadCoveringType ?? null,
    avatarHeadCoveringColor: user.avatarHeadCoveringColor ?? null,
    avatarAccessories: user.avatarAccessories ?? null,
    cubicleId: user.cubicleId ?? null,
    leadershipOfficeId: user.leadershipOfficeId ?? null,
    seniorOfficeEligible: Boolean(user.seniorOfficeEligible),
  }

  return jwt.sign(payload, OFFICE_JWT_SECRET, { expiresIn: '60s' })
}

export function verifyOfficeToken(token: string): OfficeTokenPayload {
  return jwt.verify(token, OFFICE_JWT_SECRET) as OfficeTokenPayload
}
