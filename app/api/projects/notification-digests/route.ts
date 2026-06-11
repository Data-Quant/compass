import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { sendDueProjectNotificationDigests } from '@/lib/project-notification-digests'

export const runtime = 'nodejs'

const digestBodySchema = z.object({
  dryRun: z.boolean().optional(),
})

const digestQuerySchema = z.object({
  dryRun: z.coerce.boolean().optional(),
})

function isDigestJobAuthorized(request: NextRequest) {
  const secret = process.env.PROJECT_NOTIFICATION_DIGEST_CRON_SECRET || process.env.CRON_SECRET
  if (!secret) return false

  const authHeader = request.headers.get('authorization') || ''
  if (!authHeader.startsWith('Bearer ')) return false

  const token = authHeader.slice(7).trim()
  return token.length > 0 && token === secret
}

async function validateDigestAuth(request: NextRequest) {
  const user = await getSession()
  const allowCron = isDigestJobAuthorized(request)
  const isAdmin = Boolean(user && isAdminRole(user.role))
  return isAdmin || allowCron
}

export async function GET(request: NextRequest) {
  try {
    const authorized = await validateDigestAuth(request)
    if (!authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = digestQuerySchema.safeParse({
      dryRun: request.nextUrl.searchParams.get('dryRun') ?? undefined,
    })
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid query params', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const result = await sendDueProjectNotificationDigests({
      origin: request.nextUrl.origin,
      dryRun: parsed.data.dryRun,
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error('Failed to send project notification digests:', error)
    return NextResponse.json({ error: 'Failed to send project notification digests' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const authorized = await validateDigestAuth(request)
    if (!authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let body: unknown = {}
    try {
      body = await request.json()
    } catch {
      body = {}
    }

    const parsed = digestBodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid payload', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const result = await sendDueProjectNotificationDigests({
      origin: request.nextUrl.origin,
      dryRun: parsed.data.dryRun,
    })
    return NextResponse.json(result)
  } catch (error) {
    console.error('Failed to send project notification digests:', error)
    return NextResponse.json({ error: 'Failed to send project notification digests' }, { status: 500 })
  }
}
