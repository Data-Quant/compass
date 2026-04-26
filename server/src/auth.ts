import jwt from 'jsonwebtoken'

const OFFICE_JWT_SECRET = process.env.OFFICE_JWT_SECRET || 'dev-office-secret-change-me'

export interface OfficeTokenPayload {
  userId: string
  name: string
  department: string | null
  position: string | null
  role: string
  avatarSkinTone: string | null
  avatarSchemaVersion?: number | null
  avatarBodyFrame?: string | null
  avatarOutfitType?: string | null
  avatarOutfitColor?: string | null
  avatarOutfitAccentColor?: string | null
  avatarHairCategory?: string | null
  avatarHeadCoveringType?: string | null
  avatarHeadCoveringColor?: string | null
  avatarAccessories?: string[] | null
  cubicleId?: string | null
  leadershipOfficeId?: string | null
  seniorOfficeEligible?: boolean
}

export function verifyOfficeToken(token: string): OfficeTokenPayload {
  return jwt.verify(token, OFFICE_JWT_SECRET) as OfficeTokenPayload
}
