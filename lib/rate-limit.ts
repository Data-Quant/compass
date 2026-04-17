import { prisma } from '@/lib/db'

const WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const DEFAULT_MAX_ATTEMPTS = 10

// Opportunistic cleanup sampling: roughly 1% of calls also prune expired rows.
const CLEANUP_SAMPLE_RATE = 0.01

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: Date
}

export function normalizeClientIp(rawValue: string | null | undefined): string {
  if (!rawValue) return 'unknown'

  const firstValue = rawValue.split(',')[0].trim()
  if (!firstValue) return 'unknown'

  const ipv4WithPort = firstValue.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/)
  if (ipv4WithPort) {
    return ipv4WithPort[1]
  }

  return firstValue
}

interface RateLimitRow {
  count: number
  resetAt: Date
}

// Single atomic UPSERT via Postgres. ON CONFLICT branch either:
//  - resets the counter to 1 if the window has expired, or
//  - increments the existing counter within the active window.
export async function checkRateLimit(
  key: string,
  maxAttempts = DEFAULT_MAX_ATTEMPTS
): Promise<RateLimitResult> {
  const nextReset = new Date(Date.now() + WINDOW_MS)

  try {
    const rows = await prisma.$queryRaw<RateLimitRow[]>`
      INSERT INTO "RateLimit" ("key", "count", "resetAt")
      VALUES (${key}, 1, ${nextReset})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN "RateLimit"."resetAt" < NOW() THEN 1
          ELSE "RateLimit"."count" + 1
        END,
        "resetAt" = CASE
          WHEN "RateLimit"."resetAt" < NOW() THEN EXCLUDED."resetAt"
          ELSE "RateLimit"."resetAt"
        END
      RETURNING "count", "resetAt"
    `

    const row = rows[0]
    if (!row) {
      // Should not happen; fail open to avoid locking out legitimate users.
      return { allowed: true, remaining: maxAttempts, resetAt: nextReset }
    }

    // Opportunistic cleanup — fire-and-forget to keep the table small.
    if (Math.random() < CLEANUP_SAMPLE_RATE) {
      prisma.$executeRaw`DELETE FROM "RateLimit" WHERE "resetAt" < NOW()`.catch(() => {})
    }

    return {
      allowed: row.count <= maxAttempts,
      remaining: Math.max(0, maxAttempts - row.count),
      resetAt: row.resetAt,
    }
  } catch (error) {
    // Re-throw so callers explicitly decide fail-open vs fail-closed.
    // Security-sensitive endpoints (login) should fail closed; the rest of the
    // app is already unusable when Postgres is down, so this does not change
    // availability in practice.
    console.error('[rate-limit] DB error:', error)
    throw new RateLimitUnavailableError('Rate limit backend unavailable')
  }
}

export class RateLimitUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RateLimitUnavailableError'
  }
}

export function retryAfterSeconds(resetAt: Date): number {
  const seconds = Math.ceil((resetAt.getTime() - Date.now()) / 1000)
  return seconds > 0 ? seconds : 1
}
