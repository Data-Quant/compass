import { NextResponse, type NextRequest } from 'next/server'
import { ZodError } from 'zod'
import { getSession, type SafeUser } from '@/lib/auth'
import { checkRateLimit, RateLimitUnavailableError } from '@/lib/rate-limit'
import { assertSameOrigin, SameOriginError } from '@/lib/security/same-origin'
import type { SecurityActor } from './access'
import { isSecurityChecksEnabled } from './flag'
import { loadSecurityActor } from './service/actor'
import { SecurityChecksError } from './service/errors'

const MUTATIONS_PER_WINDOW = 120

export interface SecuritySession {
  user: SafeUser
  actor: SecurityActor
}

export async function requireSecuritySession(): Promise<SecuritySession> {
  if (!isSecurityChecksEnabled()) throw new SecurityChecksError('Not found', 404)
  const user = await getSession()
  if (!user) throw new SecurityChecksError('Unauthorized', 401)
  return { user, actor: await loadSecurityActor(user) }
}

export async function guardMutation(request: NextRequest, userId: string): Promise<void> {
  assertSameOrigin(request.headers, request.url)
  try {
    const limit = await checkRateLimit(`security-checks:${userId}`, MUTATIONS_PER_WINDOW)
    if (!limit.allowed) throw new SecurityChecksError('Too many changes in a short time. Wait a few minutes and try again.', 429)
  } catch (error) {
    if (error instanceof RateLimitUnavailableError) {
      console.warn('[security-checks] rate limiter unavailable; allowing request')
      return
    }
    throw error
  }
}

export function okResponse<T>(data: T, status = 200): NextResponse {
  return NextResponse.json({ success: true, data }, { status })
}

export function errorResponse(error: unknown): NextResponse {
  const fail = (message: string, status: number) => NextResponse.json({ success: false, error: message }, { status })
  if (error instanceof SecurityChecksError) return fail(error.message, error.status)
  if (error instanceof SameOriginError) return fail(error.message, 403)
  if (error instanceof ZodError) {
    return fail(error.issues.map((issue) => (issue.path.length ? `${issue.path.join('.')}: ${issue.message}` : issue.message)).join('; '), 400)
  }
  if (error instanceof SyntaxError) return fail('The request body is not valid JSON', 400)
  console.error('[security-checks] unexpected error', error)
  return fail('Something went wrong. Reload and try again.', 500)
}
