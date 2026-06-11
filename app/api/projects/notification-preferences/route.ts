import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { ProjectNotificationDigestFrequency } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  DEFAULT_PROJECT_NOTIFICATION_TIME,
  DEFAULT_PROJECT_NOTIFICATION_WEEKDAY,
  PROJECT_NOTIFICATION_FREQUENCIES,
  PROJECT_NOTIFICATION_TIMEZONE,
  calculateNextProjectNotificationDigestAt,
  getDefaultProjectNotificationPreference,
  isValidProjectNotificationTime,
} from '@/lib/project-notification-digests'

const preferenceSchema = z.object({
  digestEnabled: z.boolean(),
  digestFrequency: z.enum(PROJECT_NOTIFICATION_FREQUENCIES as [ProjectNotificationDigestFrequency, ...ProjectNotificationDigestFrequency[]]),
  digestTime: z.string().refine(isValidProjectNotificationTime, 'Use HH:mm time format'),
  digestWeekday: z.coerce.number().int().min(0).max(6).optional(),
})

function serializePreference(preference: ReturnType<typeof getDefaultProjectNotificationPreference> & {
  id?: string
  userId?: string
  createdAt?: Date
  updatedAt?: Date
}) {
  return {
    digestEnabled: preference.digestEnabled,
    digestFrequency: preference.digestFrequency,
    digestTime: preference.digestTime,
    digestWeekday: preference.digestWeekday,
    digestTimezone: preference.digestTimezone,
    lastDigestSentAt: preference.lastDigestSentAt,
    nextDigestAt: preference.nextDigestAt,
  }
}

export async function GET() {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const preference = await prisma.projectNotificationPreference.findUnique({
      where: { userId: user.id },
    })

    return NextResponse.json({
      preference: serializePreference(preference || getDefaultProjectNotificationPreference()),
    })
  } catch (error) {
    console.error('Failed to fetch project notification preferences:', error)
    return NextResponse.json({ error: 'Failed to fetch project notification preferences' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const parsed = preferenceSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid notification preference payload', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const digestWeekday = parsed.data.digestWeekday ?? DEFAULT_PROJECT_NOTIFICATION_WEEKDAY
    const nextDigestAt = parsed.data.digestEnabled
      ? calculateNextProjectNotificationDigestAt({
          digestFrequency: parsed.data.digestFrequency,
          digestTime: parsed.data.digestTime || DEFAULT_PROJECT_NOTIFICATION_TIME,
          digestWeekday,
        })
      : null

    const preference = await prisma.projectNotificationPreference.upsert({
      where: { userId: user.id },
      update: {
        digestEnabled: parsed.data.digestEnabled,
        digestFrequency: parsed.data.digestFrequency,
        digestTime: parsed.data.digestTime,
        digestWeekday,
        digestTimezone: PROJECT_NOTIFICATION_TIMEZONE,
        nextDigestAt,
      },
      create: {
        userId: user.id,
        digestEnabled: parsed.data.digestEnabled,
        digestFrequency: parsed.data.digestFrequency,
        digestTime: parsed.data.digestTime,
        digestWeekday,
        digestTimezone: PROJECT_NOTIFICATION_TIMEZONE,
        nextDigestAt,
      },
    })

    return NextResponse.json({ success: true, preference: serializePreference(preference) })
  } catch (error) {
    console.error('Failed to save project notification preferences:', error)
    return NextResponse.json({ error: 'Failed to save project notification preferences' }, { status: 500 })
  }
}
