// The round's People tab (UX spec, HR step 2): one row per person with their lead, team and peers, warnings HR can fix
// or accept, and HR's own changes to anyone's lists for the round.
import type { MappingRelation, PeerChangeAction } from '@prisma/client'
import { prisma } from '@/lib/db'
import { getResolvedEvaluationAssignments } from '@/lib/evaluation-assignments'
import { evaluateeExclusion, isOutsideRedesign } from '../eligibility'
import { renderListChangedEmail } from '../emails'
import { isWeeklyRelationshipType } from '../perspectives'
import { readListFile } from '../list-import'
import { resolveImportedName, normalizeImportedName } from '@/lib/mapping-import'
import type { ListImportChange, ListImportResult, ParticipantsResponse, QuarterEndType, RoundWarningKey } from '../view-types'
import { recordAudit } from './audit'
import { assertHr, byName, loadPeople, personRef, type WeeklyActor } from './context'
import { loadCycle, roundOpensAt } from './cycles'
import { WeeklyError } from './errors'
import { deliverOnce, type WeeklySendMail } from './notifications'
import { applyMappingChange, mappingOf, MIN_PEERS } from './peer-requests'
import { periodRoundStage } from './round'
import { syncSlots } from './release'

const QUARTER_END: readonly QuarterEndType[] = ['C_LEVEL', 'DEPT', 'HR']


export async function participantsView(actor: WeeklyActor, cycleId: string, now: Date): Promise<ParticipantsResponse> {
  assertHr(actor)
  const cycle = await loadCycle(cycleId)
  const all = await getResolvedEvaluationAssignments(cycle.periodId)
  const assignments = all.filter((a) => isWeeklyRelationshipType(a.relationshipType))
  const quarterEnd = all.filter((a) => (QUARTER_END as readonly string[]).includes(a.relationshipType))
  // Everyone active is listed, so someone with no lists at all shows up as a gap rather than being missed.
  const active = await prisma.user.findMany({ where: { OR: [{ payrollProfile: null }, { payrollProfile: { isPayrollActive: true } }] }, select: { id: true } })
  const [people, optIns, accepted, confirmations] = await Promise.all([
    loadPeople([...active.map((u) => u.id), ...assignments.flatMap((a) => [a.evaluatorId, a.evaluateeId]), ...quarterEnd.map((a) => a.evaluatorId)]),
    prisma.weeklyParticipantOverride.findMany({ where: { cycleId, optIn: true } }),
    prisma.roundWarningAcceptance.findMany({ where: { cycleId } }),
    prisma.mappingConfirmation.findMany({ where: { periodId: cycle.periodId } }),
  ])
  const confirmedAt = new Map(confirmations.map((c) => [c.userId, c.confirmedAt.toISOString()]))
  const optInFor = new Map(optIns.map((o) => [o.userId, o]))
  const refs = (ids: string[]) => ids.map((id) => personRef(people, id)).sort(byName)
  const rows = [...people.values()].filter((person) => !isOutsideRedesign(person)).map((person) => {
    const optIn = optInFor.get(person.id)
    const exclusion = evaluateeExclusion(person, { now, opensAt: roundOpensAt(cycle), optedIn: Boolean(optIn) })
    const mapping = mappingOf(person.id, assignments)
    const keys: RoundWarningKey[] = exclusion ? [] : [...(mapping.leads.length === 0 ? (['NO_LEAD'] as const) : []), ...(mapping.peers.length < MIN_PEERS ? (['FEW_PEERS'] as const) : [])]
    return {
      person: personRef(people, person.id),
      department: person.department,
      exclusion,
      optedIn: Boolean(optIn),
      optInReason: optIn?.reason ?? null,
      leads: refs(mapping.leads), reports: refs(mapping.reports), peers: refs(mapping.peers),
      confirmedAt: confirmedAt.get(person.id) ?? null,
      warnings: keys.map((key) => ({ key, acceptedReason: accepted.find((a) => a.userId === person.id && a.warning === key)?.reason ?? null })),
      quarterEnd: quarterEnd.filter((a) => a.evaluateeId === person.id)
        .map((a) => ({ type: a.relationshipType as QuarterEndType, evaluator: personRef(people, a.evaluatorId) }))
        .sort((a, b) => QUARTER_END.indexOf(a.type) - QUARTER_END.indexOf(b.type) || byName(a.evaluator, b.evaluator)),
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
  await prisma.$transaction((tx) => applyMappingChange(tx, { periodId: cycle.periodId, ...input, note: `HR: ${reason}`, by: actor.id, live: true }))
  await recordAudit(prisma, { cycleId, actorId: actor.id, actorRole: 'HR', action: 'ROUND_MAPPING_CHANGE', objectType: 'User', objectId: input.userId, after: input })
  const stage = await periodRoundStage(cycle.periodId)
  // Mid-round, unanswered questions between people no longer paired are cancelled now, not at the next daily run.
  if (stage === 'OPEN') await syncSlots(cycle, now)
  // In Draft nobody sees the round yet (UX spec, HR step 2): the lists go out when the review stage opens.
  if (stage === 'DRAFT') return
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

type Edge = { relation: 'LEAD' | 'PEER'; a: string; b: string }
/** LEAD edges are lead>member; PEER edges are unordered, so their ids are sorted. */
const edgeKey = (e: Edge) => `${e.relation}:${e.a}>${e.b}`
const leadEdge = (lead: string, member: string): Edge => ({ relation: 'LEAD', a: lead, b: member })
const peerEdge = (x: string, y: string): Edge => (x < y ? { relation: 'PEER', a: x, b: y } : { relation: 'PEER', a: y, b: x })

/**
 * HR's spreadsheet of lists for a round, before it opens (UX spec, HR step 2). Each row is the truth for that person:
 * a lead, peer or team member it lists is added, and one it leaves out is removed. People not in the file keep their
 * lists, except for links to people who are. With `apply` false nothing is saved: HR sees the changes first.
 */
export async function importRoundLists(actor: WeeklyActor, cycleId: string, file: { name: string; bytes: ArrayBuffer }, apply: boolean): Promise<ListImportResult> {
  assertHr(actor)
  const cycle = await loadCycle(cycleId)
  const stage = await periodRoundStage(cycle.periodId)
  if (stage !== 'DRAFT' && stage !== 'REVIEW') throw new WeeklyError('Lists can be imported only before the round opens. Change them one at a time now.', 409)
  const rows = await readListFile(file)
  if (typeof rows === 'string') throw new WeeklyError(rows)
  const users = await prisma.user.findMany({ where: { OR: [{ payrollProfile: null }, { payrollProfile: { isPayrollActive: true } }] }, select: { id: true, name: true } })
  const idByName = new Map(users.map((u) => [normalizeImportedName(u.name), u.id]))
  const unknown = new Set<string>()
  const idOf = (name: string): string | null => {
    const id = idByName.get(normalizeImportedName(resolveImportedName(name))) ?? null
    if (!id) unknown.add(name.trim())
    return id
  }
  const covered = new Set<string>()
  const desired = new Map<string, Edge>()
  const want = (e: Edge | null) => { if (e && e.a !== e.b) desired.set(edgeKey(e), e) }
  for (const row of rows) {
    const me = idOf(row.name)
    if (!me) continue
    covered.add(me)
    for (const name of row.leads) { const id = idOf(name); want(id ? leadEdge(id, me) : null) }
    for (const name of row.reports) { const id = idOf(name); want(id ? leadEdge(me, id) : null) }
    for (const name of row.peers) { const id = idOf(name); want(id ? peerEdge(me, id) : null) }
  }
  const current = new Map<string, Edge>()
  for (const a of await getResolvedEvaluationAssignments(cycle.periodId)) {
    const edge = a.relationshipType === 'TEAM_LEAD' ? leadEdge(a.evaluatorId, a.evaluateeId)
      : a.relationshipType === 'DIRECT_REPORT' ? leadEdge(a.evaluateeId, a.evaluatorId)
        : a.relationshipType === 'PEER' ? peerEdge(a.evaluatorId, a.evaluateeId) : null
    if (edge) current.set(edgeKey(edge), edge)
  }
  const adds = [...desired].filter(([key]) => !current.has(key)).map(([, e]) => ({ action: 'ADD' as const, edge: e }))
  const removes = [...current].filter(([key, e]) => !desired.has(key) && (covered.has(e.a) || covered.has(e.b))).map(([, e]) => ({ action: 'REMOVE' as const, edge: e }))
  const planned = [...adds, ...removes]
  const people = await loadPeople(planned.flatMap((c) => [c.edge.a, c.edge.b]))
  const changes: ListImportChange[] = planned.map(({ action, edge }) => {
    // A lead change is shown from the team member's side; a peer pair in name order.
    const [person, other] = edge.relation === 'LEAD' ? [edge.b, edge.a] : [edge.a, edge.b].sort((x, y) => (people.get(x)?.name ?? '').localeCompare(people.get(y)?.name ?? ''))
    return { action, relation: edge.relation, person: personRef(people, person), other: personRef(people, other) }
  }).sort((x, y) => byName(x.person, y.person) || byName(x.other, y.other))
  if (apply && changes.length) {
    await prisma.$transaction(async (tx) => {
      for (const c of changes) {
        await applyMappingChange(tx, { periodId: cycle.periodId, userId: c.person.id, otherId: c.other.id, relation: c.relation, action: c.action, note: 'HR: imported lists', by: actor.id })
      }
    }, { timeout: 60_000 })
    await recordAudit(prisma, { cycleId, actorId: actor.id, actorRole: 'HR', action: 'ROUND_LIST_IMPORT', objectType: 'WeeklyCycle', objectId: cycleId, after: { file: file.name, changes: changes.length } })
  }
  return { rows: rows.length, unknownNames: [...unknown].sort(), changes, applied: apply }
}
