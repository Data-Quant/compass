import jwt from 'jsonwebtoken'

const OFFICE_JWT_SECRET = process.env.OFFICE_JWT_SECRET || 'dev-office-secret-change-me'

export interface OfficeTokenPayload {
  userId: string
  name: string
  department: string | null
  position: string | null
  role: string
}

export function verifyOfficeToken(token: string): OfficeTokenPayload {
  return jwt.verify(token, OFFICE_JWT_SECRET) as OfficeTokenPayload
}
