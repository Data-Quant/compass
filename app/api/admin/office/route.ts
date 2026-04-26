import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { isAdminRole } from '@/lib/permissions'
import { OFFICE_WORLD } from '@/shared/office-world'
import { getAvatarCatalog, getDecorCatalog, getDefaultLeadershipOfficeId, resolveOfficeIdentity } from '@/lib/office-v2'

const assignmentSchema = z.object({
  kind: z.literal('assignment'),
  userId: z.string().min(1),
  cubicleId: z.string().min(1).nullable().optional(),
  leadershipOfficeId: z.string().min(1).nullable().optional(),
  eligibilityOverride: z.boolean().nullable().optional(),
}).strict()

const roomSchema = z.object({
  kind: z.literal('room'),
  roomId: z.string().min(1),
  label: z.string().trim().min(1).max(100),
  roomType: z.string().trim().min(1).max(60),
  capacity: z.number().int().min(1).max(100).nullable().optional(),
  ownerId: z.string().nullable().optional(),
  privacyDefault: z.enum(['OPEN', 'LOCKED', 'KNOCK']).optional(),
  isVisible: z.boolean().optional(),
}).strict()

export async function GET() {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const [users, cubicleAssignments, leadershipAssignments, roomMetadata, catalogItems] =
      await Promise.all([
        prisma.user.findMany({
          select: { id: true, name: true, department: true, position: true, role: true },
          orderBy: { name: 'asc' },
        }),
        prisma.officeCubicleAssignment.findMany(),
        prisma.officeLeadershipOfficeAssignment.findMany(),
        prisma.officeRoomMetadata.findMany(),
        prisma.officeCatalogItem.findMany(),
      ])

    const cubiclesByUser = new Map(cubicleAssignments.map((item) => [item.userId, item]))
    const officesByUser = new Map(leadershipAssignments.map((item) => [item.userId, item]))

    return NextResponse.json({
      world: OFFICE_WORLD,
      catalog: { avatar: getAvatarCatalog(), decor: getDecorCatalog(), admin: catalogItems },
      roomMetadata,
      users: users.map((officeUser) => ({
        ...officeUser,
        office: resolveOfficeIdentity(officeUser, {
          cubicleId: cubiclesByUser.get(officeUser.id)?.cubicleId,
          leadershipOfficeId: officesByUser.get(officeUser.id)?.officeId,
          eligibilityOverride: officesByUser.get(officeUser.id)?.eligibilityOverride,
        }),
      })),
    })
  } catch (error) {
    console.error('Failed to fetch office admin data:', error)
    return NextResponse.json({ error: 'Failed to fetch office admin data' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    if (body.kind === 'assignment') {
      const parsed = assignmentSchema.safeParse(body)
      if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid assignment', details: parsed.error.errors }, { status: 400 })
      }

      const updates: Array<Promise<unknown>> = []
      if ('cubicleId' in parsed.data && parsed.data.cubicleId) {
        updates.push(prisma.officeCubicleAssignment.upsert({
          where: { userId: parsed.data.userId },
          create: { userId: parsed.data.userId, cubicleId: parsed.data.cubicleId, assignedById: user.id },
          update: { cubicleId: parsed.data.cubicleId, assignedById: user.id },
        }))
      }
      if ('leadershipOfficeId' in parsed.data || 'eligibilityOverride' in parsed.data) {
        const officeId = parsed.data.leadershipOfficeId || getDefaultLeadershipOfficeId(parsed.data.userId) || 'leadership-office-1'
        updates.push(prisma.officeLeadershipOfficeAssignment.upsert({
          where: { userId: parsed.data.userId },
          create: {
            userId: parsed.data.userId,
            officeId,
            eligibilityOverride: parsed.data.eligibilityOverride ?? null,
            assignedById: user.id,
          },
          update: {
            ...(parsed.data.leadershipOfficeId ? { officeId: parsed.data.leadershipOfficeId } : {}),
            eligibilityOverride: parsed.data.eligibilityOverride ?? null,
            assignedById: user.id,
          },
        }))
      }

      await Promise.all(updates)
      return NextResponse.json({ success: true })
    }

    if (body.kind === 'room') {
      const parsed = roomSchema.safeParse(body)
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

    return NextResponse.json({ error: 'Unsupported office admin update' }, { status: 400 })
  } catch (error) {
    console.error('Failed to update office admin data:', error)
    return NextResponse.json({ error: 'Failed to update office admin data' }, { status: 500 })
  }
}
