import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { isAdminRole } from '@/lib/permissions'

const schema = z.object({
  roomId: z.string().min(1),
  label: z.string().trim().min(1).max(100),
  roomType: z.string().trim().min(1).max(60),
  capacity: z.number().int().min(1).max(100).nullable().optional(),
  ownerId: z.string().nullable().optional(),
  privacyDefault: z.enum(['OPEN', 'LOCKED', 'KNOCK']).optional(),
  isVisible: z.boolean().optional(),
}).strict()

export async function PATCH(request: NextRequest) {
  const user = await getSession()
  if (!user || !isAdminRole(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid room metadata', details: parsed.error.errors }, { status: 400 })
  }

  const { roomId, ...data } = parsed.data
  const room = await prisma.officeRoomMetadata.upsert({
    where: { roomId },
    create: { roomId, ...data },
    update: data,
  })
  return NextResponse.json({ success: true, room })
}
