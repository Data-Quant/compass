import type { NextRequest } from 'next/server'
import { getSession, type SafeUser } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { checkRateLimit, RateLimitUnavailableError } from '@/lib/rate-limit'
import { assertSameOrigin } from '@/lib/security/same-origin'
import { isWeeklyEnabled } from './flag'
import { WeeklyError } from './service/errors'

export interface WeeklyRateLimit { bucket: string; limit: number }

/** Per user, per 15 minutes. Drafts autosave while people type, so they get their own, larger bucket. */
export const MUTATION_LIMIT: WeeklyRateLimit = { bucket: 'weekly', limit: 120 }
export const DRAFT_LIMIT: WeeklyRateLimit = { bucket: 'weekly-draft', limit: 900 }

export async function requireWeeklySession(options: { admin?: boolean } = {}): Promise<SafeUser> {
  if (!isWeeklyEnabled()) throw new WeeklyError('Not found', 404)
  const user = await getSession()
  if (!user) throw new WeeklyError('Unauthorized', 401)
  if (options.admin && !isAdminRole(user.role)) throw new WeeklyError('HR access required', 403)
  return user
}

export async function guardWeeklyMutation(request: NextRequest, userId: string, limit: WeeklyRateLimit = MUTATION_LIMIT): Promise<void> {
  assertSameOrigin(request.headers, request.url)
  try {
    const result = await checkRateLimit(`${limit.bucket}:${userId}`, limit.limit)
    if (!result.allowed) throw new WeeklyError('Too many changes in a short time. Wait a few minutes and try again.', 429)
  } catch (error) {
    if (error instanceof RateLimitUnavailableError) {
      console.warn('[weekly] rate limiter unavailable; allowing request')
      return
    }
    throw error
  }
}
