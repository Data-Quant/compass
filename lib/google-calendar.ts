import { LeaveStatus } from '@prisma/client'
import { prisma } from '@/lib/db'
import { C_LEVEL_EVALUATORS } from '@/lib/config'
import { safeRecordLeaveAuditEvent } from '@/lib/leave-audit'
import { normalizeLeaveTimeZone } from '@/lib/leave-timezone'
import { normalizeCoverPersonIds } from '@/lib/leave-cover'

type GoogleCalendarConfig = {
  clientId: string
  clientSecret: string
  refreshToken: string
  calendarId: string
}

type GoogleCalendarEventPayload = {
  summary: string
  description: string
  start: { date: string } | { dateTime: string; timeZone: string }
  end: { date: string } | { dateTime: string; timeZone: string }
  attendees?: Array<{ email: string }>
  extendedProperties: {
    private: Record<string, string>
  }
}

type LeaveCalendarResult =
  | { success: true; action: 'created' | 'updated'; eventId: string | null; fallbackToAllDay?: boolean }
  | { success: true; action: 'deleted'; count: number }
  | { success: true; action: 'not_found' }
  | { success: false; action: 'skipped'; reason: string }

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

const GOOGLE_CALENDAR_ENV_WARNING =
  'Google Calendar env vars not configured (GOOGLE_CALENDAR_CLIENT_ID / GOOGLE_CALENDAR_CLIENT_SECRET / GOOGLE_CALENDAR_REFRESH_TOKEN)'

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

function warnCalendarSkip(operation: 'sync' | 'remove', leaveRequestId: string, reason: string) {
  console.warn(`[leave-calendar] ${operation} skipped for leave ${leaveRequestId}: ${reason}`)
}

function isValidEmail(email: string | null | undefined): email is string {
  return Boolean(email && email.includes('@'))
}

export function shouldIncludeExecutiveLeaveInviteForPosition(position: string | null | undefined) {
  if (!position) return false

  const normalized = position.trim().toLowerCase()
  if (!normalized) return false

  return (
    normalized.includes('principal') ||
    normalized.includes('manager') ||
    normalized.includes('junior partner') ||
    /\bjp\b/.test(normalized)
  )
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

type TeamInviteLeadMapping = {
  evaluator: { email: string | null }
}

type TeamInviteDirectReportMapping = {
  evaluatee: { email: string | null }
}

type TeamInvitePeerMapping = {
  evaluatorId: string
  evaluateeId: string
  evaluator: { email: string | null }
  evaluatee: { email: string | null }
}

export function buildTeamInviteEmailSet(args: {
  employeeId: string
  leadMappings: TeamInviteLeadMapping[]
  directReportMappings: TeamInviteDirectReportMapping[]
  peerMappings: TeamInvitePeerMapping[]
}) {
  const emails = new Set<string>()

  for (const mapping of args.leadMappings) {
    if (isValidEmail(mapping.evaluator.email)) {
      emails.add(mapping.evaluator.email.toLowerCase())
    }
  }

  for (const mapping of args.directReportMappings) {
    if (isValidEmail(mapping.evaluatee.email)) {
      emails.add(mapping.evaluatee.email.toLowerCase())
    }
  }

  for (const mapping of args.peerMappings) {
    if (mapping.evaluatorId === args.employeeId) {
      if (isValidEmail(mapping.evaluatee.email)) {
        emails.add(mapping.evaluatee.email.toLowerCase())
      }
    } else if (mapping.evaluateeId === args.employeeId) {
      if (isValidEmail(mapping.evaluator.email)) {
        emails.add(mapping.evaluator.email.toLowerCase())
      }
    }
  }

  return emails
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

  return buildTeamInviteEmailSet({
    employeeId,
    leadMappings,
    directReportMappings,
    peerMappings,
  })
}

async function collectExecutiveInviteEmails() {
  const executives = await prisma.user.findMany({
    where: {
      name: { in: C_LEVEL_EVALUATORS },
      email: { not: null },
    },
    select: { email: true },
  })

  const emails = new Set<string>()
  for (const executive of executives) {
    if (isValidEmail(executive.email)) emails.add(executive.email.toLowerCase())
  }

  return emails
}

async function collectLeaveAttendeeEmails(leaveRequestId: string) {
  const leaveRequest = await prisma.leaveRequest.findUnique({
    where: { id: leaveRequestId },
    include: {
      employee: {
        select: { id: true, name: true, email: true, department: true, position: true },
      },
      coverPerson: {
        select: { id: true, email: true },
      },
    },
  })

  if (!leaveRequest) return null

  const [hrUsers, teamEmails, additionalUsers, executiveEmails] = await Promise.all([
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
    shouldIncludeExecutiveLeaveInviteForPosition(leaveRequest.employee.position)
      ? collectExecutiveInviteEmails()
      : Promise.resolve(new Set<string>()),
  ])

  const coverPersonIds = normalizeCoverPersonIds(
    leaveRequest.coverPersonIds,
    leaveRequest.coverPerson?.id ?? null,
    leaveRequest.employeeId
  )
  const coverPeople = coverPersonIds.length > 0
    ? await prisma.user.findMany({
        where: {
          id: { in: coverPersonIds },
          email: { not: null },
        },
        select: { email: true },
      })
    : []

  const allEmails = new Set<string>()

  if (isValidEmail(leaveRequest.employee.email)) allEmails.add(leaveRequest.employee.email.toLowerCase())
  for (const coverPerson of coverPeople) {
    if (isValidEmail(coverPerson.email)) allEmails.add(coverPerson.email.toLowerCase())
  }
  for (const user of hrUsers) {
    if (isValidEmail(user.email)) allEmails.add(user.email.toLowerCase())
  }
  for (const email of teamEmails) {
    allEmails.add(email.toLowerCase())
  }
  for (const user of additionalUsers) {
    if (isValidEmail(user.email)) allEmails.add(user.email.toLowerCase())
  }
  for (const email of executiveEmails) {
    allEmails.add(email.toLowerCase())
  }

  return {
    leaveRequest,
    attendeeEmails: Array.from(allEmails).sort((a, b) => a.localeCompare(b)),
  }
}

type LeaveCalendarContext = NonNullable<Awaited<ReturnType<typeof collectLeaveAttendeeEmails>>>

export function buildLeaveEventPayload({
  leaveRequest,
  attendeeEmails,
  forceAllDay = false,
}: {
  leaveRequest: LeaveCalendarContext['leaveRequest']
  attendeeEmails: string[]
  forceAllDay?: boolean
}): GoogleCalendarEventPayload {
  const startDate = toUtcDateOnly(new Date(leaveRequest.startDate))
  const endDate = toUtcDateOnly(new Date(leaveRequest.endDate))
  const returnDate = plusUtcDays(endDate, 1)
  const statusLabel = LEAVE_STATUS_LABELS[leaveRequest.status]
  const leaveTimeZone = normalizeLeaveTimeZone(leaveRequest.requestTimezone)

  const halfDaySessionLabel =
    leaveRequest.halfDaySession === 'FIRST_HALF'
      ? 'First half'
      : leaveRequest.halfDaySession === 'SECOND_HALF'
        ? 'Second half'
        : null
  const unavailableHours =
    leaveRequest.unavailableStartTime && leaveRequest.unavailableEndTime
      ? `${leaveRequest.unavailableStartTime}-${leaveRequest.unavailableEndTime}`
      : null

  const summary = `${leaveRequest.employee.name} - ${leaveRequest.leaveType}${leaveRequest.isHalfDay ? ' Half-Day' : ''} Leave (${statusLabel})`
  const descriptionLines = [
    `Employee: ${leaveRequest.employee.name}`,
    `Department: ${leaveRequest.employee.department || 'N/A'}`,
    `Leave Type: ${leaveRequest.leaveType}`,
    ...(leaveRequest.isHalfDay
      ? [
          `Half-day session: ${halfDaySessionLabel || 'Not specified'}`,
          `Unavailable hours: ${unavailableHours || 'Not specified'}`,
          `Timezone: ${leaveTimeZone}`,
        ]
      : []),
    `Status: ${statusLabel}`,
    `Start Date (first day off): ${formatUtcDateOnly(startDate)}`,
    `End Date (last day off): ${formatUtcDateOnly(endDate)}`,
    `Expected Return Date: ${leaveRequest.isHalfDay ? formatUtcDateOnly(startDate) : formatUtcDateOnly(returnDate)}`,
    `Reason: ${leaveRequest.reason}`,
    `Transition Plan: ${leaveRequest.transitionPlan?.trim() || 'Not provided yet'}`,
  ]

  const hasHalfDayTimes =
    !forceAllDay &&
    leaveRequest.isHalfDay &&
    Boolean(leaveRequest.unavailableStartTime && leaveRequest.unavailableEndTime)

  const start = hasHalfDayTimes
    ? {
        dateTime: `${formatUtcDateOnly(startDate)}T${leaveRequest.unavailableStartTime}:00`,
        timeZone: leaveTimeZone,
      }
    : { date: formatUtcDateOnly(startDate) }

  const end = hasHalfDayTimes
    ? {
        dateTime: `${formatUtcDateOnly(startDate)}T${leaveRequest.unavailableEndTime}:00`,
        timeZone: leaveTimeZone,
      }
    : {
        // Google all-day events use exclusive end date.
        date: formatUtcDateOnly(returnDate),
      }

  return {
    summary,
    description: descriptionLines.join('\n'),
    start,
    end,
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

async function upsertLeaveCalendarEvent({
  config,
  accessToken,
  primaryEventId,
  payload,
}: {
  config: GoogleCalendarConfig
  accessToken: string
  primaryEventId?: string
  payload: GoogleCalendarEventPayload
}): Promise<Extract<LeaveCalendarResult, { action: 'created' | 'updated' }>> {
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

export async function removeLeaveCalendarEvent(leaveRequestId: string): Promise<LeaveCalendarResult> {
  const config = getCalendarConfig()
  if (!config) {
    warnCalendarSkip('remove', leaveRequestId, GOOGLE_CALENDAR_ENV_WARNING)
    await safeRecordLeaveAuditEvent({
      leaveRequestId,
      channel: 'CALENDAR',
      eventType: 'CALENDAR_REMOVE',
      status: 'SKIPPED',
      metadata: {
        reason: GOOGLE_CALENDAR_ENV_WARNING,
      },
    })
    return { success: false, action: 'skipped', reason: GOOGLE_CALENDAR_ENV_WARNING }
  }

  try {
    const accessToken = await getAccessToken(config)
    const eventIds = await findLeaveEventIds(config, accessToken, leaveRequestId)

    if (eventIds.length === 0) {
      await safeRecordLeaveAuditEvent({
        leaveRequestId,
        channel: 'CALENDAR',
        eventType: 'CALENDAR_REMOVE',
        status: 'SKIPPED',
        metadata: {
          action: 'not_found',
        },
      })
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

    await safeRecordLeaveAuditEvent({
      leaveRequestId,
      channel: 'CALENDAR',
      eventType: 'CALENDAR_REMOVE',
      status: 'SUCCESS',
      metadata: {
        action: 'deleted',
        count: eventIds.length,
        eventIds,
      },
    })

    return { success: true, action: 'deleted', count: eventIds.length }
  } catch (error) {
    await safeRecordLeaveAuditEvent({
      leaveRequestId,
      channel: 'CALENDAR',
      eventType: 'CALENDAR_REMOVE',
      status: 'FAILED',
      error,
    })
    throw error
  }
}

export async function syncLeaveCalendarEvent(leaveRequestId: string): Promise<LeaveCalendarResult> {
  const config = getCalendarConfig()
  if (!config) {
    warnCalendarSkip('sync', leaveRequestId, GOOGLE_CALENDAR_ENV_WARNING)
    await safeRecordLeaveAuditEvent({
      leaveRequestId,
      channel: 'CALENDAR',
      eventType: 'CALENDAR_SYNC',
      status: 'SKIPPED',
      metadata: {
        reason: GOOGLE_CALENDAR_ENV_WARNING,
      },
    })
    return { success: false, action: 'skipped', reason: GOOGLE_CALENDAR_ENV_WARNING }
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

  try {
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

    const supportsTimedHalfDay =
      leaveRequest.isHalfDay &&
      Boolean(leaveRequest.unavailableStartTime && leaveRequest.unavailableEndTime)

    let result: LeaveCalendarResult

    if (supportsTimedHalfDay) {
      try {
        result = await upsertLeaveCalendarEvent({
          config,
          accessToken,
          primaryEventId,
          payload: buildLeaveEventPayload({ leaveRequest, attendeeEmails }),
        })
      } catch (error) {
        console.warn(
          `[leave-calendar] Timed half-day sync failed for leave ${leaveRequest.id}; retrying as all-day event.`,
          error
        )

        const fallbackResult = await upsertLeaveCalendarEvent({
          config,
          accessToken,
          primaryEventId,
          payload: buildLeaveEventPayload({ leaveRequest, attendeeEmails, forceAllDay: true }),
        })

        result = { ...fallbackResult, fallbackToAllDay: true }
      }
    } else {
      result = await upsertLeaveCalendarEvent({
        config,
        accessToken,
        primaryEventId,
        payload: buildLeaveEventPayload({ leaveRequest, attendeeEmails }),
      })
    }

    if (result.success) {
      await safeRecordLeaveAuditEvent({
        leaveRequestId,
        channel: 'CALENDAR',
        eventType: 'CALENDAR_SYNC',
        status: 'SUCCESS',
        recipients: attendeeEmails,
        subject: `${leaveRequest.employee.name} - ${leaveRequest.leaveType}${leaveRequest.isHalfDay ? ' Half-Day' : ''} Leave (${LEAVE_STATUS_LABELS[leaveRequest.status]})`,
        providerMessageId: 'eventId' in result ? result.eventId || null : null,
        metadata: {
          action: result.action,
          fallbackToAllDay: 'fallbackToAllDay' in result ? Boolean(result.fallbackToAllDay) : false,
          attendeeCount: attendeeEmails.length,
          isHalfDay: leaveRequest.isHalfDay,
          leaveStatus: leaveRequest.status,
        },
      })
    }

    return result
  } catch (error) {
    await safeRecordLeaveAuditEvent({
      leaveRequestId,
      channel: 'CALENDAR',
      eventType: 'CALENDAR_SYNC',
      status: 'FAILED',
      recipients: attendeeEmails,
      subject: `${leaveRequest.employee.name} - ${leaveRequest.leaveType}${leaveRequest.isHalfDay ? ' Half-Day' : ''} Leave (${LEAVE_STATUS_LABELS[leaveRequest.status]})`,
      metadata: {
        attendeeCount: attendeeEmails.length,
        isHalfDay: leaveRequest.isHalfDay,
        leaveStatus: leaveRequest.status,
      },
      error,
    })
    throw error
  }
}
