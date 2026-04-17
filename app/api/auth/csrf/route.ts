import { NextResponse } from 'next/server'
import {
  CSRF_COOKIE_NAME,
  CSRF_COOKIE_MAX_AGE,
  generateCsrfToken,
} from '@/lib/csrf'

// Issues a CSRF token as a non-HttpOnly cookie so the client can read it
// and echo it back in the x-csrf-token header on state-changing requests.
export async function GET() {
  const token = generateCsrfToken()

  const response = NextResponse.json({ token })
  response.cookies.set(CSRF_COOKIE_NAME, token, {
    path: '/',
    sameSite: 'lax',
    maxAge: CSRF_COOKIE_MAX_AGE,
    // Intentionally NOT HttpOnly — the client must read it to set the matching header.
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
  })

  return response
}
