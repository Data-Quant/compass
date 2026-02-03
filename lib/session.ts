import { SessionOptions } from 'iron-session'

export interface SessionData {
  userId: string
  passwordVersion: number
}

export const sessionOptions: SessionOptions = {
  password: process.env.SESSION_SECRET || 'fallback-secret-change-me-in-production-32chars!!',
  cookieName: 'pe_session',
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 7, // 7 days
  },
}
