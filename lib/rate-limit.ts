const WINDOW_MS = 15 * 60 * 1000 // 15 minutes
const MAX_ATTEMPTS = 10

const attempts = new Map<string, { count: number; resetAt: number }>()

// Periodic cleanup every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now()
  for (const [key, value] of attempts) {
    if (now > value.resetAt) {
      attempts.delete(key)
    }
  }
}, 5 * 60 * 1000)

export function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now()
  const record = attempts.get(ip)

  if (!record || now > record.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return { allowed: true, remaining: MAX_ATTEMPTS - 1 }
  }

  record.count++

  if (record.count > MAX_ATTEMPTS) {
    return { allowed: false, remaining: 0 }
  }

  return { allowed: true, remaining: MAX_ATTEMPTS - record.count }
}
