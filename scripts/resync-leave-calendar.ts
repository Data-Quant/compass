/**
 * Re-sync approved leave requests to Google Calendar.
 *
 * Defaults to dry-run mode and scans approved leave requests updated in the last 30 days.
 *
 * Usage:
 *   npm run leave:resync-calendar
 *   npm run leave:resync-calendar -- --apply
 *   npm run leave:resync-calendar -- --apply --from=2026-03-01 --to=2026-03-09
 *   npm run leave:resync-calendar -- --request-id=<leaveRequestId>
 *
 * Flags:
 *   --apply                  Execute Google Calendar syncs. Without this flag the script only prints targets.
 *   --all                    Ignore date filters and scan all approved leave requests.
 *   --from=YYYY-MM-DD        Include approved leaves updated on/after this date.
 *   --to=YYYY-MM-DD          Include approved leaves updated on/before this date.
 *   --request-id=<id>        Target a single approved leave request.
 *   --employee-id=<userId>   Limit to one employee.
 *   --limit=<n>              Max leave requests to inspect/sync. Default: 50.
 */

import { loadEnvConfig } from '@next/env'
import type { Prisma } from '@prisma/client'

loadEnvConfig(process.cwd())

const DEFAULT_LOOKBACK_DAYS = 30
const DEFAULT_LIMIT = 50

type Options = {
  apply: boolean
  all: boolean
  from?: Date
  to?: Date
  requestId?: string
  employeeId?: string
  limit: number
}

function getArgValue(flag: string) {
  const prefix = `${flag}=`
  const match = process.argv.find((arg) => arg.startsWith(prefix))
  return match ? match.slice(prefix.length).trim() : undefined
}

function hasArg(flag: string) {
  return process.argv.includes(flag)
}

function parseDateInput(value: string, flag: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${flag} must use YYYY-MM-DD format`)
  }

  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`${flag} is not a valid date`)
  }

  return parsed
}

function addUtcDays(value: Date, days: number) {
  const copy = new Date(value)
  copy.setUTCDate(copy.getUTCDate() + days)
  return copy
}

function formatDateTime(value: Date) {
  return value.toISOString()
}

function formatDateOnly(value: Date) {
  return value.toISOString().slice(0, 10)
}

function parseOptions(): Options {
  const requestId = getArgValue('--request-id')
  const employeeId = getArgValue('--employee-id')
  const limitRaw = getArgValue('--limit')
  const fromRaw = getArgValue('--from')
  const toRaw = getArgValue('--to')
  const all = hasArg('--all')
  const apply = hasArg('--apply')

  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : DEFAULT_LIMIT
  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error('--limit must be a positive integer')
  }

  const from = fromRaw ? parseDateInput(fromRaw, '--from') : undefined
  const to = toRaw ? parseDateInput(toRaw, '--to') : undefined

  if (from && to && from > to) {
    throw new Error('--from cannot be after --to')
  }

  return {
    apply,
    all,
    from,
    to,
    requestId,
    employeeId,
    limit,
  }
}

function buildWhereClause(options: Options): Prisma.LeaveRequestWhereInput {
  if (options.requestId) {
    return {
      id: options.requestId,
      status: 'APPROVED',
      ...(options.employeeId ? { employeeId: options.employeeId } : {}),
    }
  }

  const updatedAt: Prisma.DateTimeFilter = {}

  if (!options.all) {
    const defaultFrom = addUtcDays(new Date(), -DEFAULT_LOOKBACK_DAYS)
    updatedAt.gte = options.from ?? defaultFrom
    if (options.to) {
      updatedAt.lt = addUtcDays(options.to, 1)
    }
  } else {
    if (options.from) {
      updatedAt.gte = options.from
    }
    if (options.to) {
      updatedAt.lt = addUtcDays(options.to, 1)
    }
  }

  return {
    status: 'APPROVED',
    ...(options.employeeId ? { employeeId: options.employeeId } : {}),
    ...(Object.keys(updatedAt).length > 0 ? { updatedAt } : {}),
  }
}

async function main() {
  const [{ prisma }, { syncLeaveCalendarEvent }] = await Promise.all([
    import('../lib/db'),
    import('../lib/google-calendar'),
  ])
  try {
    const options = parseOptions()
    const mode = options.apply ? 'APPLY' : 'DRY RUN'
    const where = buildWhereClause(options)

    console.log(`\n=== Leave Calendar Re-sync (${mode}) ===`)
    console.log(`Scope: ${options.requestId ? `request ${options.requestId}` : 'approved leaves'}`)
    console.log(`Limit: ${options.limit}`)

    if (!options.all && !options.requestId) {
      console.log(`Lookback: last ${DEFAULT_LOOKBACK_DAYS} days${options.from ? ` (overridden from ${formatDateOnly(options.from)})` : ''}`)
    }
    if (options.from) {
      console.log(`From: ${formatDateOnly(options.from)}`)
    }
    if (options.to) {
      console.log(`To: ${formatDateOnly(options.to)}`)
    }
    if (options.employeeId) {
      console.log(`Employee ID: ${options.employeeId}`)
    }

    const leaveRequests = await prisma.leaveRequest.findMany({
      where,
      take: options.limit,
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        employeeId: true,
        leaveType: true,
        isHalfDay: true,
        startDate: true,
        endDate: true,
        updatedAt: true,
        employee: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    })

    console.log(`Matched approved leaves: ${leaveRequests.length}`)

    if (leaveRequests.length === 0) {
      console.log('Nothing to process.')
      return
    }

    for (const leave of leaveRequests) {
      const label = [
        leave.employee.name,
        leave.leaveType,
        leave.isHalfDay ? 'half-day' : 'full-day',
        `${formatDateOnly(leave.startDate)}..${formatDateOnly(leave.endDate)}`,
        `updated ${formatDateTime(leave.updatedAt)}`,
      ].join(' | ')

      console.log(`- ${leave.id} | ${label}`)
    }

    if (!options.apply) {
      console.log('\nDry run only. Re-run with --apply to sync these leave requests to Google Calendar.')
      return
    }

    let created = 0
    let updated = 0
    let skipped = 0
    let failed = 0
    let fallbackToAllDay = 0

    for (const leave of leaveRequests) {
      try {
        const result = await syncLeaveCalendarEvent(leave.id)

        if (!result.success) {
          skipped += 1
          console.log(`SKIPPED ${leave.id}: ${result.reason}`)
          continue
        }

        if (result.action === 'created') {
          created += 1
        } else if (result.action === 'updated') {
          updated += 1
        } else {
          skipped += 1
        }

        if ('fallbackToAllDay' in result && result.fallbackToAllDay) {
          fallbackToAllDay += 1
        }

        console.log(
          `OK ${leave.id}: ${result.action}${'fallbackToAllDay' in result && result.fallbackToAllDay ? ' (fallback to all-day)' : ''}`
        )
      } catch (error) {
        failed += 1
        console.error(`FAILED ${leave.id}:`, error)
      }
    }

    console.log('\n=== Summary ===')
    console.log(`Created: ${created}`)
    console.log(`Updated: ${updated}`)
    console.log(`Skipped: ${skipped}`)
    console.log(`Failed: ${failed}`)
    console.log(`Fallback to all-day: ${fallbackToAllDay}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error('Leave calendar re-sync failed:', error)
  process.exit(1)
})
