import type { NextRequest } from 'next/server'
import { errorResponse, okResponse, requireSecuritySession } from '@/lib/security-checks/http'
import { previousMonthKey, selfReviewReport } from '@/lib/security-checks/service/reports'
import { SecurityChecksError } from '@/lib/security-checks/service/errors'

export async function GET(request: NextRequest) {
  try {
    const { actor } = await requireSecuritySession()
    const month = request.nextUrl.searchParams.get('month') ?? previousMonthKey(new Date())
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new SecurityChecksError('Use a YYYY-MM month', 400)
    return okResponse({ month, items: await selfReviewReport(actor, month) })
  } catch (error) {
    return errorResponse(error)
  }
}
