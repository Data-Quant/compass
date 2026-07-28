import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

/**
 * The clients this person works on, with each roster.
 *
 * Resolved live rather than from the session: the session is cookie-derived and
 * does not re-read the database, so somebody added to a client would otherwise
 * not see the section until they logged out and back in.
 *
 * Inactive clients are left out. They stay on record for HR but an ended
 * engagement should not sit on someone's page.
 */
export async function GET() {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const assignments = await prisma.clientAssignment.findMany({
      where: { userId: user.id, client: { status: 'ACTIVE' } },
      include: {
        client: {
          include: {
            assignments: {
              include: {
                user: { select: { id: true, name: true, department: true, position: true } },
              },
            },
          },
        },
      },
    })

    const clients = assignments
      .map((assignment) => ({
        id: assignment.client.id,
        name: assignment.client.name,
        description: assignment.client.description,
        // The viewer's own role decides whether they get the request button.
        myRole: assignment.role,
        roster: assignment.client.assignments
          .map((entry) => ({
            userId: entry.user.id,
            name: entry.user.name,
            department: entry.user.department,
            position: entry.user.position,
            role: entry.role,
          }))
          // Managers first, then alphabetical, so the lead is always at the top.
          .sort((a, b) =>
            a.role === b.role ? a.name.localeCompare(b.name) : a.role === 'MANAGER' ? -1 : 1
          ),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    return NextResponse.json({ clients, hasAccess: clients.length > 0 })
  } catch (error) {
    console.error('Failed to fetch clientele:', error)
    return NextResponse.json({ error: 'Failed to fetch clientele' }, { status: 500 })
  }
}
