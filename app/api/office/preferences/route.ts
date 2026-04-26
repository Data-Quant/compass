import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { stripHtml } from '@/lib/sanitize'

const preferencesSchema = z.object({
  preferredStatusText: z.string().trim().max(80).nullable().optional(),
  audioSettings: z.record(z.unknown()).nullable().optional(),
  panelLayout: z.record(z.unknown()).nullable().optional(),
  dismissedHints: z.array(z.string().max(80)).nullable().optional(),
  selectedDecor: z.record(z.unknown()).nullable().optional(),
}).strict()

type ParsedPreferences = z.infer<typeof preferencesSchema>

/**
 * Atomically merge a partial preferences PATCH into the existing row.
 *
 * Two concerns this addresses:
 *  - Race: two PATCHes with disjoint fields (e.g. {audioSettings:…} and
 *    {panelLayout:…}) used to clobber each other because each upsert wrote
 *    every column the second one omitted as the schema-default. Wrapping
 *    in a serializable transaction with a read-modify-write keeps both
 *    writes intact.
 *  - Partial updates: only fields explicitly present in the PATCH body are
 *    written. Omitted keys keep their existing value.
 */
function buildMergedRow(
  existing: {
    preferredStatusText: string | null
    audioSettings: Prisma.JsonValue
    panelLayout: Prisma.JsonValue
    dismissedHints: Prisma.JsonValue
    selectedDecor: Prisma.JsonValue
  } | null,
  body: Record<string, unknown>,
  parsed: ParsedPreferences
) {
  const jsonValue = (value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull =>
    value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue)
  return {
    preferredStatusText:
      'preferredStatusText' in body
        ? typeof parsed.preferredStatusText === 'string'
          ? stripHtml(parsed.preferredStatusText)
          : parsed.preferredStatusText ?? null
        : existing?.preferredStatusText ?? null,
    audioSettings:
      'audioSettings' in body
        ? jsonValue(parsed.audioSettings)
        : (existing?.audioSettings as Prisma.InputJsonValue | null) ?? Prisma.JsonNull,
    panelLayout:
      'panelLayout' in body
        ? jsonValue(parsed.panelLayout)
        : (existing?.panelLayout as Prisma.InputJsonValue | null) ?? Prisma.JsonNull,
    dismissedHints:
      'dismissedHints' in body
        ? jsonValue(parsed.dismissedHints)
        : (existing?.dismissedHints as Prisma.InputJsonValue | null) ?? Prisma.JsonNull,
    selectedDecor:
      'selectedDecor' in body
        ? jsonValue(parsed.selectedDecor)
        : (existing?.selectedDecor as Prisma.InputJsonValue | null) ?? Prisma.JsonNull,
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as Record<string, unknown>
    const parsed = preferencesSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid preferences', details: parsed.error.errors }, { status: 400 })
    }

    const preference = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.officeUserPreference.findUnique({ where: { userId: user.id } })
        const merged = buildMergedRow(existing, body, parsed.data)
        return tx.officeUserPreference.upsert({
          where: { userId: user.id },
          create: { userId: user.id, ...merged },
          update: merged,
        })
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )

    return NextResponse.json({ success: true, preference })
  } catch (error) {
    console.error('Failed to save office preferences:', error)
    return NextResponse.json({ error: 'Failed to save office preferences' }, { status: 500 })
  }
}
