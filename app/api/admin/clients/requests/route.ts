import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'

/**
 * HR's queue of roster change requests.
 *
 * HR applies the changes themselves through the assignments route; this only
 * tracks whether a request has been dealt with, so nothing is quietly dropped.
 */

const resolveSchema = z.object({
  id: z.string().trim().min(1),
  status: z.enum(['COMPLETED', 'DISMISSED']),
})

export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    const requests = await prisma.clientRosterRequest.findMany({
      where: status === 'all' ? undefined : { status: 'PENDING' },
      include: {
        client: { select: { id: true, name: true } },
        requestedBy: { select: { id: true, name: true } },
        resolvedBy: { select: { id: true, name: true } },
        items: { include: { user: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })

    return NextResponse.json({ requests })
  } catch (error) {
    console.error('Failed to fetch roster requests:', error)
    return NextResponse.json({ error: 'Failed to fetch roster requests' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = resolveSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error.errors }, { status: 400 })
    }

    const updated = await prisma.clientRosterRequest.update({
      where: { id: parsed.data.id },
      data: {
        status: parsed.data.status,
        resolvedById: user.id,
        resolvedAt: new Date(),
      },
    })

    return NextResponse.json({ success: true, request: updated })
  } catch (error) {
    console.error('Failed to resolve roster request:', error)
    return NextResponse.json({ error: 'Failed to resolve roster request' }, { status: 500 })
  }
}
