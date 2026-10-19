import { errorResponse, okResponse, requireSecuritySession } from '@/lib/security-checks/http'
import { listMyTasks } from '@/lib/security-checks/service/tasks'

export async function GET() {
  try {
    const { actor } = await requireSecuritySession()
    return okResponse(await listMyTasks(actor, new Date()))
  } catch (error) {
    return errorResponse(error)
  }
}
