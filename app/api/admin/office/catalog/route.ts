import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { isAdminRole } from '@/lib/permissions'

const schema = z.object({
  kind: z.enum(['DECOR', 'AVATAR']),
  key: z.string().min(1).max(120),
  label: z.string().min(1).max(120),
  category: z.string().min(1).max(80),
  payload: z.unknown().optional(),
  isActive: z.boolean().optional(),
}).strict()

export async function PATCH(request: NextRequest) {
  const user = await getSession()
  if (!user || !isAdminRole(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid catalog item', details: parsed.error.errors }, { status: 400 })
  }

  const metadata = {
    category: parsed.data.category,
    payload: parsed.data.payload ?? null,
  } as Prisma.InputJsonObject

  const item = await prisma.officeCatalogItem.upsert({
    where: {
      kind_key: {
        kind: parsed.data.kind,
        key: parsed.data.key,
      },
    },
    create: {
      kind: parsed.data.kind,
      key: parsed.data.key,
      label: parsed.data.label,
      metadata,
      isActive: parsed.data.isActive ?? true,
    },
    update: {
      label: parsed.data.label,
      metadata,
      isActive: parsed.data.isActive ?? true,
    },
  })

  return NextResponse.json({ success: true, item })
}
