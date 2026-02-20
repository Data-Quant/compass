import { LeaveStatus } from '@prisma/client'
import { prisma } from '@/lib/db'

type GoogleCalendarConfig = {
  clientId: string
  clientSecret: string
  refreshToken: string
  calendarId: string
}

type GoogleCalendarEventPayload = {
  summary: string
  description: string
  start: { date: string }
  end: { date: string }
  attendees?: Array<{ email: string }>
  extendedProperties: {
    private: Record<string, string>
  }
}

// Calendar invites are only sent for fully approved leave.
const ACTIVE_LEAVE_STATUSES = new Set<LeaveStatus>(['APPROVED'])

const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  PENDING: 'Pending',
  LEAD_APPROVED: 'Lead Approved',
  HR_APPROVED: 'HR Approved',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
}

function getCalendarConfig(): GoogleCalendarConfig | null {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET?.trim()
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN?.trim()
  const calendarId = (process.env.GOOGLE_CALENDAR_ID?.trim() || 'primary')

  if (!clientId || !clientSecret || !refreshToken) {
    return null
  }

  return { clientId, clientSecret, refreshToken, calendarId }
}

function isValidEmail(email: string | null | undefined): email is string {
  return Boolean(email && email.includes('@'))
}

function toUtcDateOnly(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
}

function formatUtcDateOnly(value: Date) {
  const y = value.getUTCFullYear()
  const m = String(value.getUTCMonth() + 1).padStart(2, '0')
  const d = String(value.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function plusUtcDays(value: Date, days: number) {
  const next = toUtcDateOnly(value)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

async function getAccessToken(config: GoogleCalendarConfig) {
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

function buildEventsUrl(config: GoogleCalendarConfig, eventId?: string) {
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events`
  if (!eventId) return base
  return `${base}/${encodeURIComponent(eventId)}`
}

async function googleCalendarRequest<T>({
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

async function findLeaveEventIds(config: GoogleCalendarConfig, accessToken: string, leaveRequestId: string) {
  const data = await googleCalendarRequest<{ items?: Array<{ id?: string }> }>({
    config,
    accessToken,
    method: 'GET',
    query: {
      maxResults: 50,
      singleEvents: false,
      privateExtendedProperty: `leaveRequestId=${leaveRequestId}`,
      showDeleted: false,
    },
  })

  return (data.items || [])
    .map((item) => item.id)
    .filter((id): id is string => Boolean(id))
}

async function collectTeamInviteEmails(employeeId: string) {
  const [leadMappings, directReportMappings, peerMappings] = await Promise.all([
    prisma.evaluatorMapping.findMany({
      where: {
        evaluateeId: employeeId,
        relationshipType: 'TEAM_LEAD',
      },
      select: {
        evaluator: { select: { email: true } },
      },
    }),
    prisma.evaluatorMapping.findMany({
      where: {
        evaluatorId: employeeId,
        relationshipType: 'TEAM_LEAD',
      },
      select: {
        evaluatee: { select: { email: true } },
      },
    }),
    prisma.evaluatorMapping.findMany({
      where: {
        relationshipType: 'PEER',
        OR: [{ evaluatorId: employeeId }, { evaluateeId: employeeId }],
      },
      select: {
        evaluatorId: true,
        evaluateeId: true,
        evaluator: { select: { email: true } },
        evaluatee: { select: { email: true } },
      },
    }),
  ])

  const emails = new Set<string>()

  for (const mapping of leadMappings) {
    if (isValidEmail(mapping.evaluator.email)) emails.add(mapping.evaluator.email.toLowerCase())
  }

  for (const mapping of directReportMappings) {
    if (isValidEmail(mapping.evaluatee.email)) emails.add(mapping.evaluatee.email.toLowerCase())
  }

  for (const mapping of peerMappings) {
    if (mapping.evaluatorId === employeeId) {
      if (isValidEmail(mapping.evaluatee.email)) emails.add(mapping.evaluatee.email.toLowerCase())
    } else if (mapping.evaluateeId === employeeId) {
      if (isValidEmail(mapping.evaluator.email)) emails.add(mapping.evaluator.email.toLowerCase())
    }
  }

  return emails
}

async function collectLeaveAttendeeEmails(leaveRequestId: string) {
  const leaveRequest = await prisma.leaveRequest.findUnique({
    where: { id: leaveRequestId },
    include: {
      employee: {
        select: { id: true, name: true, email: true, department: true },
      },
      coverPerson: {
        select: { id: true, email: true },
      },
    },
  })

  if (!leaveRequest) return null

  const [hrUsers, teamEmails, additionalUsers] = await Promise.all([
    prisma.user.findMany({
      where: {
        role: 'HR',
        email: { not: null },
      },
      select: { email: true },
    }),
    collectTeamInviteEmails(leaveRequest.employeeId),
    Array.isArray(leaveRequest.additionalNotifyIds) && leaveRequest.additionalNotifyIds.length > 0
      ? prisma.user.findMany({
          where: {
            id: { in: leaveRequest.additionalNotifyIds as string[] },
            email: { not: null },
          },
          select: { email: true },
        })
      : Promise.resolve([] as Array<{ email: string | null }>),
  ])

  const allEmails = new Set<string>()

  if (isValidEmail(leaveRequest.employee.email)) allEmails.add(leaveRequest.employee.email.toLowerCase())
  if (isValidEmail(leaveRequest.coverPerson?.email)) allEmails.add(leaveRequest.coverPerson.email.toLowerCase())
  for (const user of hrUsers) {
    if (isValidEmail(user.email)) allEmails.add(user.email.toLowerCase())
  }
  for (const email of teamEmails) {
    allEmails.add(email.toLowerCase())
  }
  for (const user of additionalUsers) {
    if (isValidEmail(user.email)) allEmails.add(user.email.toLowerCase())
  }

  return {
    leaveRequest,
    attendeeEmails: Array.from(allEmails).sort((a, b) => a.localeCompare(b)),
  }
}

type LeaveCalendarContext = NonNullable<Awaited<ReturnType<typeof collectLeaveAttendeeEmails>>>

function buildLeaveEventPayload({
  leaveRequest,
  attendeeEmails,
}: {
  leaveRequest: LeaveCalendarContext['leaveRequest']
  attendeeEmails: string[]
}): GoogleCalendarEventPayload {
  const startDate = toUtcDateOnly(new Date(leaveRequest.startDate))
  const endDate = toUtcDateOnly(new Date(leaveRequest.endDate))
  const returnDate = plusUtcDays(endDate, 1)
  const statusLabel = LEAVE_STATUS_LABELS[leaveRequest.status]

  const summary = `${leaveRequest.employee.name} • ${leaveRequest.leaveType} Leave (${statusLabel})`
  const descriptionLines = [
    `Employee: ${leaveRequest.employee.name}`,
    `Department: ${leaveRequest.employee.department || 'N/A'}`,
    `Leave Type: ${leaveRequest.leaveType}`,
    `Status: ${statusLabel}`,
    `Start Date (first day off): ${formatUtcDateOnly(startDate)}`,
    `End Date (last day off): ${formatUtcDateOnly(endDate)}`,
    `Expected Return Date: ${formatUtcDateOnly(returnDate)}`,
    `Reason: ${leaveRequest.reason}`,
    `Transition Plan: ${leaveRequest.transitionPlan?.trim() || 'Not provided yet'}`,
  ]

  return {
    summary,
    description: descriptionLines.join('\n'),
    start: { date: formatUtcDateOnly(startDate) },
    // Google all-day events use exclusive end date.
    end: { date: formatUtcDateOnly(returnDate) },
    ...(attendeeEmails.length > 0
      ? {
          attendees: attendeeEmails.map((email) => ({ email })),
        }
      : {}),
    extendedProperties: {
      private: {
        leaveRequestId: leaveRequest.id,
        employeeId: leaveRequest.employeeId,
      },
    },
  }
}

export async function removeLeaveCalendarEvent(leaveRequestId: string) {
  const config = getCalendarConfig()
  if (!config) {
    return { success: false, action: 'skipped', reason: 'Google Calendar env vars not configured' }
  }

  const accessToken = await getAccessToken(config)
  const eventIds = await findLeaveEventIds(config, accessToken, leaveRequestId)

  if (eventIds.length === 0) {
    return { success: true, action: 'not_found' }
  }

  for (const eventId of eventIds) {
    await googleCalendarRequest<null>({
      config,
      accessToken,
      method: 'DELETE',
      eventId,
      query: { sendUpdates: 'all' },
    })
  }

  return { success: true, action: 'deleted', count: eventIds.length }
}

export async function syncLeaveCalendarEvent(leaveRequestId: string) {
  const config = getCalendarConfig()
  if (!config) {
    return { success: false, action: 'skipped', reason: 'Google Calendar env vars not configured' }
  }

  const leaveData = await collectLeaveAttendeeEmails(leaveRequestId)
  if (!leaveData) {
    // Request no longer exists; ensure stale calendar events are removed.
    return removeLeaveCalendarEvent(leaveRequestId)
  }

  const { leaveRequest, attendeeEmails } = leaveData

  if (!ACTIVE_LEAVE_STATUSES.has(leaveRequest.status)) {
    return removeLeaveCalendarEvent(leaveRequest.id)
  }

  const accessToken = await getAccessToken(config)
  const eventIds = await findLeaveEventIds(config, accessToken, leaveRequest.id)
  const primaryEventId = eventIds[0]

  // Clean up duplicates if they exist.
  if (eventIds.length > 1) {
    for (const duplicateEventId of eventIds.slice(1)) {
      await googleCalendarRequest<null>({
        config,
        accessToken,
        method: 'DELETE',
        eventId: duplicateEventId,
        query: { sendUpdates: 'all' },
      })
    }
  }

  const payload = buildLeaveEventPayload({ leaveRequest, attendeeEmails })

  if (primaryEventId) {
    await googleCalendarRequest<unknown>({
      config,
      accessToken,
      method: 'PATCH',
      eventId: primaryEventId,
      query: { sendUpdates: 'all' },
      body: payload,
    })
    return { success: true, action: 'updated', eventId: primaryEventId }
  }

  const created = await googleCalendarRequest<{ id?: string }>({
    config,
    accessToken,
    method: 'POST',
    query: { sendUpdates: 'all' },
    body: payload,
  })

  return { success: true, action: 'created', eventId: created.id || null }
}
