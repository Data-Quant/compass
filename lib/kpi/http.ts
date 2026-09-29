import type { NextRequest } from 'next/server'
import { getSession, type SafeUser } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { checkRateLimit, RateLimitUnavailableError } from '@/lib/rate-limit'
import { assertSameOrigin } from '@/lib/security/same-origin'
import { isKpiEnabled } from './flag'
import { KpiError } from './service/errors'

export interface MutationLimit { bucket: string; limit: number }

/** Per user, per 15 minutes. */
const DEFAULT_LIMIT: MutationLimit = { bucket: 'kpi', limit: 120 }
export const UPLOAD_LIMIT: MutationLimit = { bucket: 'kpi-upload', limit: 20 }

export async function requireKpiSession(options: { admin?: boolean } = {}): Promise<SafeUser> {
  if (!isKpiEnabled()) throw new KpiError('Not found', 404)
  const user = await getSession()
  if (!user) throw new KpiError('Unauthorized', 401)
  if (options.admin && !isAdminRole(user.role)) throw new KpiError('HR access required', 403)
  return user
}

export async function guardMutation(request: NextRequest, userId: string, limit: MutationLimit = DEFAULT_LIMIT): Promise<void> {
  assertSameOrigin(request.headers, request.url)
  try {
    const result = await checkRateLimit(`${limit.bucket}:${userId}`, limit.limit)
    if (!result.allowed) throw new KpiError('Too many changes in a short time. Wait a few minutes and try again.', 429)
  } catch (error) {
    if (error instanceof RateLimitUnavailableError) {
      console.warn('[kpi] rate limiter unavailable; allowing request')
      return
    }
    throw error
  }
}
