import { canManageCampaigns, canManageConsoleGrants } from '@/lib/security-checks/access'
import { errorResponse, okResponse, requireSecuritySession } from '@/lib/security-checks/http'
import { requireCapability } from '@/lib/security-checks/service/actor'
import { loadDirectory } from '@/lib/security-checks/service/directory'

/** Active employees for the audience and Console Admin pickers. */
export async function GET() {
  try {
    const { actor } = await requireSecuritySession()
    requireCapability(canManageCampaigns(actor) || canManageConsoleGrants(actor))
    const people = (await loadDirectory()).filter((person) => person.active)
    const departments = [...new Set(people.map((person) => person.department?.trim()).filter((d): d is string => Boolean(d)))].sort()
    const teams = [...new Set(people.map((person) => person.teamTag).filter((t): t is NonNullable<typeof t> => Boolean(t)))].sort()
    return okResponse({
      people: people.map((person) => ({ id: person.id, name: person.name, department: person.department, teamTag: person.teamTag, position: person.position })),
      departments,
      teams,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
