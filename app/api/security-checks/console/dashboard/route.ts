import { errorResponse, okResponse, requireSecuritySession } from '@/lib/security-checks/http'
import { companyDashboard } from '@/lib/security-checks/service/dashboard'

export async function GET() {
  try {
    const { actor } = await requireSecuritySession()
    return okResponse(await companyDashboard(actor, new Date()))
  } catch (error) {
    return errorResponse(error)
  }
}
