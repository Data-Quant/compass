import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { capabilitiesOf } from '@/lib/security-checks/access'
import { isSecurityChecksEnabled } from '@/lib/security-checks/flag'
import { errorResponse, okResponse, requireSecuritySession } from '@/lib/security-checks/http'
import { unreadCount } from '@/lib/security-checks/service/inbox'

export async function GET() {
  if (!isSecurityChecksEnabled()) return NextResponse.json({ success: true, data: { enabled: false } })
  try {
    const { actor } = await requireSecuritySession()
    const [actionable, unread] = await Promise.all([
      prisma.securityTask.count({ where: { userId: actor.id, status: { in: ['NOT_STARTED', 'IN_PROGRESS', 'REJECTED', 'REQUIRES_INFO'] } } }),
      unreadCount(actor.id),
    ])
    return okResponse({ enabled: true, capabilities: capabilitiesOf(actor), actionable, unread })
  } catch (error) {
    return errorResponse(error)
  }
}
