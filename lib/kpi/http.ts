import type { NextRequest } from 'next/server'
import { getSession, type SafeUser } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { checkRateLimit, RateLimitUnavailableError } from '@/lib/rate-limit'
import { assertSameOrigin } from '@/lib/security/same-origin'
import { isKpiEnabled } from './flag'
import { KpiError } from './service/errors'

const MUTATIONS_PER_WINDOW = 120

export async function requireKpiSession(options: { admin?: boolean } = {}): Promise<SafeUser> {
  if (!isKpiEnabled()) throw new KpiError('Not found', 404)
  const user = await getSession()
  if (!user) throw new KpiError('Unauthorized', 401)
  if (options.admin && !isAdminRole(user.role)) throw new KpiError('HR access required', 403)
  return user
}

export async function guardMutation(request: NextRequest, userId: string): Promise<void> {
  assertSameOrigin(request.headers, request.url)
  try {
    const limit = await checkRateLimit(`kpi:${userId}`, MUTATIONS_PER_WINDOW)
    if (!limit.allowed) throw new KpiError('Too many changes in a short time. Wait a few minutes and try again.', 429)
  } catch (error) {
    if (error instanceof RateLimitUnavailableError) {
      console.warn('[kpi] rate limiter unavailable; allowing request')
      return
    }
    throw error
  }
}
