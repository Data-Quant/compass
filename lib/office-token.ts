import jwt from 'jsonwebtoken'

const OFFICE_JWT_SECRET = process.env.OFFICE_JWT_SECRET || 'dev-office-secret-change-me'

export interface OfficeTokenPayload {
  userId: string
  name: string
  department: string | null
  position: string | null
  role: string
}

export function generateOfficeToken(user: {
  id: string
  name: string
  department?: string | null
  position?: string | null
  role: string
}): string {
  const payload: OfficeTokenPayload = {
    userId: user.id,
    name: user.name,
    department: user.department ?? null,
    position: user.position ?? null,
    role: user.role,
  }

  return jwt.sign(payload, OFFICE_JWT_SECRET, { expiresIn: '60s' })
}

export function verifyOfficeToken(token: string): OfficeTokenPayload {
  return jwt.verify(token, OFFICE_JWT_SECRET) as OfficeTokenPayload
}
