import jwt from 'jsonwebtoken'

const OFFICE_JWT_SECRET = process.env.OFFICE_JWT_SECRET || 'dev-office-secret-change-me'

export interface OfficeTokenPayload {
  userId: string
  name: string
  department: string | null
  position: string | null
  role: string
  avatarBodyType: string | null
  avatarHairStyle: number | null
  avatarHairColor: string | null
  avatarSkinTone: string | null
  avatarShirtColor: string | null
}

export function generateOfficeToken(user: {
  id: string
  name: string
  department?: string | null
  position?: string | null
  role: string
  avatarBodyType?: string | null
  avatarHairStyle?: number | null
  avatarHairColor?: string | null
  avatarSkinTone?: string | null
  avatarShirtColor?: string | null
}): string {
  const payload: OfficeTokenPayload = {
    userId: user.id,
    name: user.name,
    department: user.department ?? null,
    position: user.position ?? null,
    role: user.role,
    avatarBodyType: user.avatarBodyType ?? null,
    avatarHairStyle: user.avatarHairStyle ?? null,
    avatarHairColor: user.avatarHairColor ?? null,
    avatarSkinTone: user.avatarSkinTone ?? null,
    avatarShirtColor: user.avatarShirtColor ?? null,
  }

  return jwt.sign(payload, OFFICE_JWT_SECRET, { expiresIn: '60s' })
}

export function verifyOfficeToken(token: string): OfficeTokenPayload {
  return jwt.verify(token, OFFICE_JWT_SECRET) as OfficeTokenPayload
}
