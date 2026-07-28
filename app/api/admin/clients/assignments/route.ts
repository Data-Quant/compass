import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { wouldLeaveClientUnmanaged } from '@/lib/clientele'

/** HR adding, re-roling and removing people on a client roster. */

const upsertSchema = z.object({
  clientId: z.string().trim().min(1),
  userId: z.string().trim().min(1),
  role: z.enum(['MANAGER', 'MEMBER']),
})

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = upsertSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payload', details: parsed.error.errors }, { status: 400 })
    }

    const { clientId, userId, role } = parsed.data

    // Upsert rather than create: re-adding someone already on the client is read
    // as a role change, which is what HR means by it.
    const assignment = await prisma.clientAssignment.upsert({
      where: { clientId_userId: { clientId, userId } },
      create: { clientId, userId, role },
      update: { role },
      include: { user: { select: { id: true, name: true } } },
    })

    return NextResponse.json({ success: true, assignment })
  } catch (error) {
    console.error('Failed to assign client member:', error)
    return NextResponse.json({ error: 'Failed to assign client member' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const clientId = searchParams.get('clientId')
    const userId = searchParams.get('userId')
    const force = searchParams.get('force') === 'true'

    if (!clientId || !userId) {
      return NextResponse.json({ error: 'clientId and userId are required' }, { status: 400 })
    }

    const assignments = await prisma.clientAssignment.findMany({
      where: { clientId },
      select: { userId: true, role: true },
    })

    // A client with no manager has nobody who can request changes to it, so this
    // is surfaced before it happens rather than discovered later.
    if (!force && wouldLeaveClientUnmanaged(assignments, userId)) {
      return NextResponse.json(
        {
          error:
            'This is the only manager on this client. Removing them leaves nobody able to request roster changes.',
          requiresConfirmation: true,
        },
        { status: 409 }
      )
    }

    await prisma.clientAssignment.deleteMany({ where: { clientId, userId } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to remove client member:', error)
    return NextResponse.json({ error: 'Failed to remove client member' }, { status: 500 })
  }
}
