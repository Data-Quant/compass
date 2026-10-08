// The round's People tab (UX spec, HR step 2): one row per person with their lead, team and peers, warnings HR can fix
// or accept, and HR's own changes to anyone's lists for the round.
import type { MappingRelation, PeerChangeAction } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getResolvedEvaluationAssignments } from '@/lib/evaluation-assignments'
import { cycleWeeks } from '../calendar'
import { evaluateeExclusion, isOutsideRedesign } from '../eligibility'
import { renderListChangedEmail } from '../emails'
import { isWeeklyRelationshipType } from '../perspectives'
import type { ParticipantsResponse, RoundWarningKey } from '../view-types'
import { recordAudit } from './audit'
import { assertHr, byName, loadPeople, personRef, type WeeklyActor } from './context'
import { loadCycle } from './cycles'
import { WeeklyError } from './errors'
import { deliverOnce, type WeeklySendMail } from './notifications'
import { applyMappingChange, mappingOf } from './peer-requests'

const MIN_PEERS = 2

export async function participantsView(actor: WeeklyActor, cycleId: string, now: Date): Promise<ParticipantsResponse> {
  assertHr(actor)
  const cycle = await loadCycle(cycleId)
  const assignments = (await getResolvedEvaluationAssignments(cycle.periodId)).filter((a) => isWeeklyRelationshipType(a.relationshipType))
  // Everyone active is listed, so someone with no lists at all shows up as a gap rather than being missed.
  const active = await prisma.user.findMany({ where: { OR: [{ payrollProfile: null }, { payrollProfile: { isPayrollActive: true } }] }, select: { id: true } })
  const [people, optIns, accepted] = await Promise.all([
    loadPeople([...active.map((u) => u.id), ...assignments.flatMap((a) => [a.evaluatorId, a.evaluateeId])]),
    prisma.weeklyParticipantOverride.findMany({ where: { cycleId, optIn: true } }),
    prisma.roundWarningAcceptance.findMany({ where: { cycleId } }),
  ])
  const optInFor = new Map(optIns.map((o) => [o.userId, o]))
  const total = cycleWeeks(cycle)
  const refs = (ids: string[]) => ids.map((id) => personRef(people, id)).sort(byName)
  const rows = [...people.values()].filter((person) => !isOutsideRedesign(person)).map((person) => {
    const optIn = optInFor.get(person.id)
    const exclusion = evaluateeExclusion(person, { now, weekOneStartsOn: cycle.weekOneStartsOn, totalWeeks: total, optedIn: Boolean(optIn) })
    const mapping = mappingOf(person.id, assignments)
    const keys: RoundWarningKey[] = exclusion ? [] : [...(mapping.leads.length === 0 ? (['NO_LEAD'] as const) : []), ...(mapping.peers.length < MIN_PEERS ? (['FEW_PEERS'] as const) : [])]
    return {
      person: personRef(people, person.id),
      department: person.department,
      exclusion,
      optedIn: Boolean(optIn),
      optInReason: optIn?.reason ?? null,
      leads: refs(mapping.leads), reports: refs(mapping.reports), peers: refs(mapping.peers),
      warnings: keys.map((key) => ({ key, acceptedReason: accepted.find((a) => a.userId === person.id && a.warning === key)?.reason ?? null })),
    }
  })
  return { cycleId, rows: rows.sort((a, b) => byName(a.person, b.person)) }
}

export async function acceptRoundWarning(actor: WeeklyActor, cycleId: string, input: { userId: string; warning: RoundWarningKey; reason: string }): Promise<void> {
  assertHr(actor)
  await loadCycle(cycleId)
  const reason = input.reason.trim()
  if (reason.length < 3) throw new WeeklyError('Give a reason')
  const key = { cycleId, userId: input.userId, warning: input.warning }
  await prisma.roundWarningAcceptance.upsert({
    where: { cycleId_userId_warning: key },
    create: { ...key, reason, acceptedById: actor.id },
    update: { reason, acceptedById: actor.id },
  })
  await recordAudit(prisma, { cycleId, actorId: actor.id, actorRole: 'HR', action: 'ROUND_WARNING_ACCEPT', objectType: 'User', objectId: input.userId, after: { warning: input.warning, reason } })
}

const CHANGE_WORDS: Record<MappingRelation, [string, string]> = { PEER: ['a peer', 'peer'], LEAD: ['your lead', 'lead'], REPORT: ['a team member', 'team member'] }

/** HR changes someone's lists for this round, in both directions, with a reason; both people are told. */
export async function changeRoundMapping(
  actor: WeeklyActor, cycleId: string,
  input: { userId: string; otherId: string; relation: MappingRelation; action: PeerChangeAction; reason: string },
  now: Date, send: WeeklySendMail, appUrl: string,
): Promise<void> {
  assertHr(actor)
  const cycle = await loadCycle(cycleId)
  if (cycle.status === 'CLOSED') throw new WeeklyError('This round is closed', 409)
  const reason = input.reason.trim()
  if (reason.length < 3) throw new WeeklyError('Give a reason for the change')
  if (input.userId === input.otherId) throw new WeeklyError('Choose two different people')
  const people = await loadPeople([input.userId, input.otherId])
  const person = people.get(input.userId)
  const other = people.get(input.otherId)
  if (!person || !other) throw new WeeklyError('Person not found', 404)
  await prisma.$transaction((tx) => applyMappingChange(tx, { periodId: cycle.periodId, ...input, note: `HR: ${reason}`, by: actor.id }))
  await recordAudit(prisma, { cycleId, actorId: actor.id, actorRole: 'HR', action: 'ROUND_MAPPING_CHANGE', objectType: 'User', objectId: input.userId, after: input })
  const [what] = CHANGE_WORDS[input.relation]
  const verb = input.action === 'ADD' ? 'added' : 'removed'
  await deliverOnce([
    { userId: person.id, text: `HR ${verb} ${other.name} as ${what} for ${cycle.period.name}.` },
    { userId: other.id, text: `HR ${verb} ${person.name} ${input.relation === 'PEER' ? 'as a peer' : input.relation === 'LEAD' ? 'as a team member' : 'as your lead'} for ${cycle.period.name}.` },
  ].map((m) => ({
    userId: m.userId, kind: 'weekly-mapping' as const, dedupeKey: `list-changed:${cycleId}:${m.userId}:${input.otherId}:${input.userId}:${input.relation}:${input.action}:${now.toISOString()}`,
    render: (name: string) => renderListChangedEmail({ name, change: m.text, appUrl }),
  })), send)
}
