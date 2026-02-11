const WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const DEFAULT_MAX_ATTEMPTS = 10

const attempts = new Map<string, { count: number; resetAt: number }>()

// Periodic cleanup every 5 minutes to prevent memory leaks
const cleanupInterval = setInterval(() => {
  const now = Date.now()
  for (const [key, value] of attempts) {
    if (now > value.resetAt) {
      attempts.delete(key)
    }
  }
}, 5 * 60 * 1000)

cleanupInterval.unref?.()

export function normalizeClientIp(rawValue: string | null | undefined): string {
  if (!rawValue) return 'unknown'

  // x-forwarded-for may contain a comma-separated list. Use the first client IP.
  const firstValue = rawValue.split(',')[0].trim()
  if (!firstValue) return 'unknown'

  // Strip IPv4 port suffix if present (e.g. "203.0.113.10:1234").
  const ipv4WithPort = firstValue.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/)
  if (ipv4WithPort) {
    return ipv4WithPort[1]
  }

  return firstValue
}

export function checkRateLimit(key: string, maxAttempts = DEFAULT_MAX_ATTEMPTS): { allowed: boolean; remaining: number } {
  const now = Date.now()
  const record = attempts.get(key)

  if (!record || now > record.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return { allowed: true, remaining: maxAttempts - 1 }
  }

  record.count++

  if (record.count > maxAttempts) {
    return { allowed: false, remaining: 0 }
  }

  return { allowed: true, remaining: maxAttempts - record.count }
}
