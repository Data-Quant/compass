const DEFAULT_LEAVE_TIMEZONE = 'Asia/Karachi'

export function getDefaultLeaveTimeZone() {
  const configured = process.env.LEAVE_CALENDAR_TIMEZONE?.trim()
  return configured || DEFAULT_LEAVE_TIMEZONE
}

export function normalizeLeaveTimeZone(value?: string | null) {
  const candidate = value?.trim()
  const fallback = getDefaultLeaveTimeZone()

  if (!candidate) {
    return fallback
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date())
    return candidate
  } catch {
    return fallback
  }
}

export function detectBrowserLeaveTimeZone() {
  if (typeof Intl === 'undefined' || typeof Intl.DateTimeFormat !== 'function') {
    return DEFAULT_LEAVE_TIMEZONE
  }

  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
  return normalizeLeaveTimeZone(detected)
}
