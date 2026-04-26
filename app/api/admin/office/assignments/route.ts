import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { isAdminRole } from '@/lib/permissions'
import { getDefaultLeadershipOfficeId } from '@/lib/office-v2'

const schema = z.object({
  userId: z.string().min(1),
  cubicleId: z.string().min(1).nullable().optional(),
  leadershipOfficeId: z.string().min(1).nullable().optional(),
  eligibilityOverride: z.boolean().nullable().optional(),
}).strict()

export async function PATCH(request: NextRequest) {
  const user = await getSession()
  if (!user || !isAdminRole(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid assignment', details: parsed.error.errors }, { status: 400 })
  }

  const updates: Array<Promise<unknown>> = []
  if (parsed.data.cubicleId) {
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
