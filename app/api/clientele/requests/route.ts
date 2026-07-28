import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canRequestRosterChange, validateRosterRequest } from '@/lib/clientele'
import { sendRosterChangeRequestNotification } from '@/lib/email'

/**
 * A manager asking HR to change who works on their client.
 *
 * Managers do not edit the roster themselves; they raise a request and HR applies
 * it. The request is stored as well as emailed, so HR can work from a queue and a
 * request cannot be lost in an inbox.
 */

const createSchema = z.object({
  clientId: z.string().trim().min(1),
  note: z.string().trim().max(2000).optional(),
  items: z
    .array(
      z.object({
        userId: z.string().trim().min(1),
        action: z.enum(['ADD', 'REMOVE']),
        role: z.enum(['MANAGER', 'MEMBER']).optional(),
      })
    )
    .min(1),
})

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = createSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error.errors }, { status: 400 })
    }

    const assignments = await prisma.clientAssignment.findMany({
      where: { userId: user.id },
      select: { clientId: true, role: true },
    })

    // Checked server-side: hiding the button is presentation, not permission.
    if (!canRequestRosterChange(assignments, parsed.data.clientId)) {
      return NextResponse.json(
        { error: 'Only a manager on this client can request roster changes' },
        { status: 403 }
      )
    }

    const currentRoster = await prisma.clientAssignment.findMany({
      where: { clientId: parsed.data.clientId },
      select: { userId: true },
    })

    const validation = validateRosterRequest({
      items: parsed.data.items,
      currentMemberIds: currentRoster.map((entry) => entry.userId),
      requestedById: user.id,
    })

    if (!validation.ok) {
      return NextResponse.json({ error: validation.reason }, { status: 400 })
    }

    const created = await prisma.clientRosterRequest.create({
      data: {
        clientId: parsed.data.clientId,
        requestedById: user.id,
        note: parsed.data.note || null,
        items: {
          create: parsed.data.items.map((item) => ({
            userId: item.userId,
            action: item.action,
            role: item.action === 'ADD' ? item.role ?? 'MEMBER' : null,
          })),
        },
      },
    })

    // The request is already saved, so a mail failure loses the notification but
    // not the request itself; HR still sees it in the admin queue.
    const mail = await sendRosterChangeRequestNotification(created.id)

    return NextResponse.json({ success: true, requestId: created.id, emailed: mail.success })
  } catch (error) {
    console.error('Failed to submit roster change request:', error)
    return NextResponse.json({ error: 'Failed to submit roster change request' }, { status: 500 })
  }
}

// GET - the requests this manager has raised, so they can see what is outstanding.
export async function GET() {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const requests = await prisma.clientRosterRequest.findMany({
      where: { requestedById: user.id },
      include: {
        client: { select: { id: true, name: true } },
        items: { include: { user: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
    })

    return NextResponse.json({ requests })
  } catch (error) {
    console.error('Failed to fetch roster requests:', error)
    return NextResponse.json({ error: 'Failed to fetch roster requests' }, { status: 500 })
  }
}
