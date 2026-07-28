import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

/**
 * Whether the Clientele section should appear in this person's sidebar.
 *
 * Deliberately a count rather than the full roster: the sidebar loads on every
 * page, and it only needs a yes or no. Resolved from the database rather than the
 * session, which is cookie-derived and would otherwise leave someone newly added
 * to a client without the section until they logged out and back in.
 */
export async function GET() {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ hasAccess: false }, { status: 401 })
    }

    const count = await prisma.clientAssignment.count({
      where: { userId: user.id, client: { status: 'ACTIVE' } },
    })

    return NextResponse.json({ hasAccess: count > 0 })
  } catch (error) {
    console.error('Failed to check clientele access:', error)
    // Fail closed: a transient error hides the section rather than showing an
    // empty one to everybody.
    return NextResponse.json({ hasAccess: false })
  }
}
