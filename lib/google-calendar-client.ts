/**
 * Transport for the company Google Calendar.
 *
 * Config, auth, request plumbing and date formatting only -- nothing here knows what a
 * leave or a holiday is. Both lib/google-calendar.ts and lib/holiday-calendar.ts build
 * their payloads on top of this, so the two cannot drift apart on authentication,
 * error handling or how an all-day date is written.
 */

export type GoogleCalendarConfig = {
  clientId: string
  clientSecret: string
  refreshToken: string
  calendarId: string
}

export type GoogleCalendarDate = { date: string } | { dateTime: string; timeZone: string }

export type GoogleCalendarEventPayload = {
  summary: string
  description: string
  start: GoogleCalendarDate
  end: GoogleCalendarDate
  attendees?: Array<{ email: string }>
  guestsCanSeeOtherGuests?: boolean
  guestsCanInviteOthers?: boolean
  transparency?: 'opaque' | 'transparent'
  extendedProperties: {
    private: Record<string, string>
  }
}

export const GOOGLE_CALENDAR_ENV_WARNING =
  'Google Calendar env vars not configured (GOOGLE_CALENDAR_CLIENT_ID / GOOGLE_CALENDAR_CLIENT_SECRET / GOOGLE_CALENDAR_REFRESH_TOKEN)'

export function getCalendarConfig(): GoogleCalendarConfig | null {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim()
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN?.trim()
  const calendarId = (process.env.GOOGLE_CALENDAR_ID?.trim() || 'primary')

  if (!clientId || !clientSecret || !refreshToken) {
    return null
  }

  return { clientId, clientSecret, refreshToken, calendarId }
}

export function isValidEmail(email: string | null | undefined): email is string {
  return Boolean(email && email.includes('@'))
}

export function toUtcDateOnly(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
}

export function formatUtcDateOnly(value: Date) {
  const y = value.getUTCFullYear()
  const m = String(value.getUTCMonth() + 1).padStart(2, '0')
  const d = String(value.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function plusUtcDays(value: Date, days: number) {
  const next = toUtcDateOnly(value)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

export async function getAccessToken(config: GoogleCalendarConfig) {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: config.refreshToken,
    grant_type: 'refresh_token',
  })

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Failed to refresh Google OAuth token (${response.status}): ${text}`)
  }

  const data = await response.json() as { access_token?: string }
  if (!data.access_token) {
    throw new Error('Google OAuth response missing access_token')
  }
  return data.access_token
}

export function buildEventsUrl(config: GoogleCalendarConfig, eventId?: string) {
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events`
  if (!eventId) return base
  return `${base}/${encodeURIComponent(eventId)}`
}

export async function googleCalendarRequest<T>({
  config,
  accessToken,
  method,
  eventId,
  query,
  body,
}: {
  config: GoogleCalendarConfig
  accessToken: string
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  eventId?: string
  query?: Record<string, string | number | boolean>
  body?: unknown
}): Promise<T> {
  const url = new URL(buildEventsUrl(config, eventId))
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      url.searchParams.set(key, String(value))
    })
  }

  const response = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Google Calendar ${method} failed (${response.status}): ${text}`)
  }

  if (response.status === 204) {
    return null as T
  }

  return response.json() as Promise<T>
}

/** Event ids tagged with a given private extended property, the idempotency key. */
export async function findEventIdsByPrivateProperty(
  config: GoogleCalendarConfig,
  accessToken: string,
  key: string,
  value: string
) {
  const data = await googleCalendarRequest<{ items?: Array<{ id?: string }> }>({
    config,
    accessToken,
    method: 'GET',
    query: {
      maxResults: 50,
      singleEvents: false,
      privateExtendedProperty: `${key}=${value}`,
      showDeleted: false,
    },
  })

  return (data.items || [])
    .map((item) => item.id)
    .filter((id): id is string => Boolean(id))
}

export type CalendarEventSummary = {
  id: string
  privateProperties: Record<string, string>
}

/**
 * Every event in a date range, paged to completion.
 *
 * Needed because Google can only be queried for an exact `key=value` extended
 * property, never for "any event carrying this key". Finding events whose owning row
 * has been deleted therefore means listing the window and filtering here.
 */
export async function listEventsInRange(
  config: GoogleCalendarConfig,
  accessToken: string,
  range: { timeMin: Date; timeMax: Date }
): Promise<CalendarEventSummary[]> {
  const events: CalendarEventSummary[] = []
  let pageToken: string | undefined

  do {
    const data = await googleCalendarRequest<{
      items?: Array<{ id?: string; extendedProperties?: { private?: Record<string, string> } }>
      nextPageToken?: string
    }>({
      config,
      accessToken,
      method: 'GET',
      query: {
        maxResults: 250,
        singleEvents: true,
        showDeleted: false,
        timeMin: range.timeMin.toISOString(),
        timeMax: range.timeMax.toISOString(),
        ...(pageToken ? { pageToken } : {}),
      },
    })

    for (const item of data.items || []) {
      if (!item.id) continue
      events.push({ id: item.id, privateProperties: item.extendedProperties?.private || {} })
    }

    pageToken = data.nextPageToken
  } while (pageToken)

  return events
}
