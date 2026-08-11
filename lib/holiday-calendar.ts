import type { TeamTag } from '@prisma/client'
import { prisma } from '@/lib/db'
import { ALL_TEAMS, TEAM_LABELS } from '@/lib/handbook/teams'
import { isUntaggedHoliday, teamsObserving } from '@/lib/holidays'
import {
  GOOGLE_CALENDAR_ENV_WARNING,
  findEventIdsByPrivateProperty,
  formatUtcDateOnly,
  getAccessToken,
  getCalendarConfig,
  googleCalendarRequest,
  isValidEmail,
  listEventsInRange,
  plusUtcDays,
  toUtcDateOnly,
  type GoogleCalendarConfig,
  type GoogleCalendarEventPayload,
} from '@/lib/google-calendar-client'

/**
 * Public holidays as calendar invites.
 *
 * Until now a holiday produced only the monthly digest email, so a holiday entered in
 * January for June stayed invisible on everyone's calendar until June. The invite is
 * created when HR saves the holiday and reconciled by the monthly sweep.
 *
 * Who observes a holiday is decided by lib/holidays.ts, the same module the payroll
 * engine uses for working days -- resolving it separately here is how the calendar and
 * someone's travel allowance would end up disagreeing about who was off.
 */

/** The private extended property that makes a holiday's event findable again. */
export const HOLIDAY_EVENT_KEY = 'holidayId'

export type HolidayForCalendar = {
  id: string
  name: string
  holidayDate: Date
  teamTags: TeamTag[]
}

export type HolidayCalendarResult =
  | { success: true; action: 'created' | 'updated'; eventId: string | null }
  | { success: true; action: 'deleted'; count: number }
  | { success: true; action: 'not_found' }
  | { success: false; action: 'skipped'; reason: string }

function warnHolidaySkip(operation: 'sync' | 'remove' | 'sweep', holidayId: string, reason: string) {
  console.warn(`[holiday-calendar] ${operation} skipped for holiday ${holidayId}: ${reason}`)
}

function observingTeamsLabel(holiday: Pick<HolidayForCalendar, 'teamTags'>): string {
  // An untagged holiday applies to everyone; listing all seven teams by name would be
  // technically correct and unreadable.
  if (isUntaggedHoliday(holiday)) return 'All teams'

  return teamsObserving(holiday, ALL_TEAMS)
    .map((team) => TEAM_LABELS[team])
    .join(', ')
}

export function buildHolidayEventPayload({
  holiday,
  attendeeEmails,
}: {
  holiday: HolidayForCalendar
  attendeeEmails: string[]
}): GoogleCalendarEventPayload {
  const date = toUtcDateOnly(new Date(holiday.holidayDate))

  return {
    summary: `Public Holiday — ${holiday.name}`,
    description: [
      `${holiday.name} is a public holiday.`,
      `Observed by: ${observingTeamsLabel(holiday)}`,
      '',
      'No work is expected on this day. Please plan deadlines and handovers around it.',
    ].join('\n'),
    start: { date: formatUtcDateOnly(date) },
    // Google's all-day end date is exclusive, so a one-day holiday ends the next day.
    end: { date: formatUtcDateOnly(plusUtcDays(date, 1)) },
    ...(attendeeEmails.length > 0
      ? { attendees: attendeeEmails.map((email) => ({ email })) }
      : {}),
    // These invites go to whole teams at once. Hiding the guest list keeps one invite
    // from broadcasting everyone's address, and blocking guest invites keeps a company
    // holiday from acquiring attendees nobody intended.
    guestsCanSeeOtherGuests: false,
    guestsCanInviteOthers: false,
    // The day is genuinely not workable, so it should block scheduling rather than
    // sit in the calendar as free time.
    transparency: 'opaque',
    extendedProperties: {
      private: { [HOLIDAY_EVENT_KEY]: holiday.id },
    },
  }
}

/**
 * Everyone who should see the holiday: the observing teams, plus the same HR, Partner
 * and Execution addresses the digest email copies, so the invite and the mail reach
 * the same people.
 */
export async function collectHolidayAttendeeEmails(holiday: HolidayForCalendar) {
  const teams = teamsObserving(holiday, ALL_TEAMS)

  const [teamMembers, partners, staff] = await Promise.all([
    prisma.user.findMany({
      where: { teamTag: { in: teams }, email: { not: null } },
      select: { email: true },
    }),
    prisma.user.findMany({
      where: { position: { contains: 'partner', mode: 'insensitive' }, email: { not: null } },
      select: { email: true },
    }),
    prisma.user.findMany({
      where: { role: { in: ['HR', 'EXECUTION'] }, email: { not: null } },
      select: { email: true },
    }),
  ])

  const emails = new Set<string>()
  for (const user of [...teamMembers, ...partners, ...staff]) {
    if (isValidEmail(user.email)) emails.add(user.email.toLowerCase())
  }

  return Array.from(emails).sort((a, b) => a.localeCompare(b))
}

async function upsertHolidayEvent({
  config,
  accessToken,
  primaryEventId,
  payload,
}: {
  config: GoogleCalendarConfig
  accessToken: string
  primaryEventId?: string
  payload: GoogleCalendarEventPayload
}): Promise<HolidayCalendarResult> {
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

async function deleteEvents(
  config: GoogleCalendarConfig,
  accessToken: string,
  eventIds: string[]
) {
  for (const eventId of eventIds) {
    await googleCalendarRequest<null>({
      config,
      accessToken,
      method: 'DELETE',
      eventId,
      // Attendees are told the holiday is off their calendar, rather than being left
      // with an event that quietly no longer exists.
      query: { sendUpdates: 'all' },
    })
  }
}

/** Create or update the invite for one holiday. Safe to call repeatedly. */
export async function syncHolidayCalendarEvent(holidayId: string): Promise<HolidayCalendarResult> {
  const config = getCalendarConfig()
  if (!config) {
    warnHolidaySkip('sync', holidayId, GOOGLE_CALENDAR_ENV_WARNING)
    return { success: false, action: 'skipped', reason: GOOGLE_CALENDAR_ENV_WARNING }
  }

  const holiday = await prisma.payrollPublicHoliday.findUnique({
    where: { id: holidayId },
    select: { id: true, name: true, holidayDate: true, teamTags: true },
  })

  // The row is gone, so the invite should be too.
  if (!holiday) {
    return removeHolidayCalendarEvent(holidayId)
  }

  const accessToken = await getAccessToken(config)
  const eventIds = await findEventIdsByPrivateProperty(
    config,
    accessToken,
    HOLIDAY_EVENT_KEY,
    holidayId
  )

  // Duplicates can only come from a partially failed earlier run; collapse them.
  if (eventIds.length > 1) {
    await deleteEvents(config, accessToken, eventIds.slice(1))
  }

  const attendeeEmails = await collectHolidayAttendeeEmails(holiday)

  return upsertHolidayEvent({
    config,
    accessToken,
    primaryEventId: eventIds[0],
    payload: buildHolidayEventPayload({ holiday, attendeeEmails }),
  })
}

/** Cancel the invite for a holiday, whether or not the row still exists. */
export async function removeHolidayCalendarEvent(
  holidayId: string
): Promise<HolidayCalendarResult> {
  const config = getCalendarConfig()
  if (!config) {
    warnHolidaySkip('remove', holidayId, GOOGLE_CALENDAR_ENV_WARNING)
    return { success: false, action: 'skipped', reason: GOOGLE_CALENDAR_ENV_WARNING }
  }

  const accessToken = await getAccessToken(config)
  const eventIds = await findEventIdsByPrivateProperty(
    config,
    accessToken,
    HOLIDAY_EVENT_KEY,
    holidayId
  )

  if (eventIds.length === 0) {
    return { success: true, action: 'not_found' }
  }

  await deleteEvents(config, accessToken, eventIds)
  return { success: true, action: 'deleted', count: eventIds.length }
}

export type HolidaySweepResult = {
  horizonMonths: number
  holidays: number
  synced: number
  orphansRemoved: number
  failed: number
  errors: string[]
  skipped?: string
}

const SWEEP_HORIZON_MONTHS = 12

/**
 * Reconcile holiday invites, in both directions.
 *
 * Iterating holiday rows alone would never repair a failed deletion: the row is gone,
 * so nothing points at the event it left behind. The second pass lists the window and
 * cancels any holiday event whose row no longer exists -- without it, one failed
 * delete leaves a phantom public holiday on every attendee's calendar for good.
 */
export async function sweepHolidayCalendarEvents(
  options: { dryRun?: boolean; now?: Date } = {}
): Promise<HolidaySweepResult> {
  const { dryRun = false, now = new Date() } = options

  const result: HolidaySweepResult = {
    horizonMonths: SWEEP_HORIZON_MONTHS,
    holidays: 0,
    synced: 0,
    orphansRemoved: 0,
    failed: 0,
    errors: [],
  }

  const config = getCalendarConfig()
  if (!config) {
    warnHolidaySkip('sweep', 'all', GOOGLE_CALENDAR_ENV_WARNING)
    return { ...result, skipped: GOOGLE_CALENDAR_ENV_WARNING }
  }

  const from = toUtcDateOnly(now)
  const to = new Date(from)
  to.setUTCMonth(to.getUTCMonth() + SWEEP_HORIZON_MONTHS)

  const holidays = await prisma.payrollPublicHoliday.findMany({
    where: { holidayDate: { gte: from, lte: to } },
    select: { id: true, name: true, holidayDate: true, teamTags: true },
    orderBy: { holidayDate: 'asc' },
  })
  result.holidays = holidays.length

  if (dryRun) {
    return result
  }

  for (const holiday of holidays) {
    try {
      const outcome = await syncHolidayCalendarEvent(holiday.id)
      if (outcome.success && (outcome.action === 'created' || outcome.action === 'updated')) {
        result.synced += 1
      }
    } catch (error) {
      result.failed += 1
      result.errors.push(
        `${holiday.name}: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  try {
    const accessToken = await getAccessToken(config)
    const events = await listEventsInRange(config, accessToken, { timeMin: from, timeMax: to })
    const knownIds = new Set(holidays.map((holiday) => holiday.id))

    const orphans = events.filter((event) => {
      const holidayId = event.privateProperties[HOLIDAY_EVENT_KEY]
      return Boolean(holidayId) && !knownIds.has(holidayId)
    })

    if (orphans.length > 0) {
      await deleteEvents(config, accessToken, orphans.map((event) => event.id))
      result.orphansRemoved = orphans.length
    }
  } catch (error) {
    result.failed += 1
    result.errors.push(
      `orphan sweep: ${error instanceof Error ? error.message : String(error)}`
    )
  }

  return result
}
