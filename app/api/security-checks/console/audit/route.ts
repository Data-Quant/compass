import type { NextRequest } from 'next/server'
import { errorResponse, okResponse, requireSecuritySession } from '@/lib/security-checks/http'
import { listAuditLog } from '@/lib/security-checks/service/exports'

/** Read-only: the application exposes no update or delete operation on the audit log. */
export async function GET(request: NextRequest) {
  try {
    const { actor } = await requireSecuritySession()
    const params = request.nextUrl.searchParams
    const pick = (key: string) => params.get(key)?.slice(0, 100) || undefined
    return okResponse(
      await listAuditLog(actor, {
        campaignId: pick('campaignId'),
        taskId: pick('taskId'),
        action: pick('action'),
        selfReviewOnly: params.get('selfReview') === '1',
        before: pick('before'),
      }),
    )
  } catch (error) {
    return errorResponse(error)
  }
}
