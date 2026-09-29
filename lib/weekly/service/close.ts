import { prisma } from '@/lib/db'
import { getResolvedEvaluationAssignments, type ResolvedEvaluationAssignment } from '@/lib/evaluation-assignments'
import type { AggregationCounts } from '../aggregation'
import { categoryKey, closeBlockers, dropCandidates, hasBlockers, type CloseBlockers } from '../close-rules'
import { isWeeklyRelationshipType, perspectiveOf, type Perspective } from '../perspectives'
import { isConfirmedAction } from '../reviews'
import type { CloseViewResponse } from '../view-types'
import { aggregateCycle, hasLeftBy, type DropRecord } from './aggregate'
import { loadAnswerRecords, type AnswerRecord } from './answer-states'
import { recordAudit } from './audit'
import { challengeDeadlineFor } from './challenge-window'
import { assertHr, byName, loadPeople, personRef, type WeeklyActor } from './context'
import { cycleSummary, loadCycle, type CycleWithPeriod } from './cycles'
import { coverageRows } from './dashboard'
import { autoAcceptDue } from './decisions'
import { WeeklyError } from './errors'
import { formsOpenDate, formsOpenFor, formsProgress } from './forms'

export const DROP_NOTE = 'Weekly evaluations: no accepted evidence in this group, dropped at quarter close'

interface Category { evaluateeId: string; perspective: Perspective; assignments: ResolvedEvaluationAssignment[] }

/** Each active person's weekly groups, with the assignments a drop would remove. */
async function weeklyCategories(cycle: CycleWithPeriod, now: Date): Promise<Map<string, Category>> {
  const assignments = (await getResolvedEvaluationAssignments(cycle.periodId)).filter((a) => isWeeklyRelationshipType(a.relationshipType))
  const people = await loadPeople(assignments.map((a) => a.evaluateeId))
  const categories = new Map<string, Category>()
  for (const assignment of assignments) {
    const perspective = perspectiveOf(assignment.relationshipType)
    const person = people.get(assignment.evaluateeId)
    if (!perspective || !person || hasLeftBy(person, now)) continue
    const key = categoryKey(assignment.evaluateeId, perspective)
    const current = categories.get(key) ?? { evaluateeId: assignment.evaluateeId, perspective, assignments: [] }
    categories.set(key, { ...current, assignments: [...current.assignments, assignment] })
  }
  return categories
}

function confirmedCounts(records: readonly AnswerRecord[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const r of records) {
    if (!r.latestReview || !isConfirmedAction(r.latestReview.action)) continue
    const key = categoryKey(r.evaluateeId, r.perspective)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

function describe(blockers: CloseBlockers): string {
  return [
    blockers.scoring && `${blockers.scoring} still being scored`,
    blockers.failed && `${blockers.failed} whose scoring failed`,
    blockers.needsReview && `${blockers.needsReview} waiting for review`,
  ].filter(Boolean).join(', ')
}

export async function closeView(actor: WeeklyActor, cycleId: string, now: Date): Promise<CloseViewResponse> {
  assertHr(actor)
  const cycle = await loadCycle(cycleId)
  const period = await prisma.evaluationPeriod.findUniqueOrThrow({ where: { id: cycle.periodId }, select: { isLocked: true } })
  const running = cycle.status === 'RUNNING'
  const records = running ? await loadAnswerRecords({ cycleId }) : []
  const blockers = closeBlockers(records.map((r) => r.state))
  const categories = running ? await weeklyCategories(cycle, now) : new Map<string, Category>()
  const candidates = dropCandidates([...categories.values()], confirmedCounts(records))
  const [people, openPrompts, progress, coverage, lastRun] = await Promise.all([
    loadPeople(candidates.map((c) => c.evaluateeId)),
    prisma.weeklyPrompt.count({ where: { cycleId, status: { in: ['OPEN', 'DRAFT'] } } }),
    formsProgress(cycle.periodId),
    running ? coverageRows(cycleId) : Promise.resolve([]),
    prisma.weeklyAggregationRun.findFirst({ where: { cycleId }, orderBy: { createdAt: 'desc' } }),
  ])
  const runner = lastRun ? (await loadPeople([lastRun.runById])).get(lastRun.runById) : undefined
  const formEvaluators = await loadPeople(progress.pendingEvaluatorIds)
  const outstanding = progress.pendingEvaluatorIds.map((id) => personRef(formEvaluators, id).name).sort((a, b) => a.localeCompare(b))
  return {
    cycle: cycleSummary(cycle, now),
    periodLocked: period.isLocked,
    closedAt: cycle.closedAt?.toISOString() ?? null,
    resultsPublishedAt: cycle.resultsPublishedAt?.toISOString() ?? null,
    challengeDeadline: cycle.resultsPublishedAt ? (await challengeDeadlineFor(cycle.resultsPublishedAt)).toISOString() : null,
    blockers,
    pendingAutoAccept: records.filter((r) => r.state === 'AUTO_ACCEPT_PENDING').length,
    openPrompts,
    forms: { open: formsOpenFor(cycle, now), opensAt: formsOpenDate(cycle).toISOString(), total: progress.total, done: progress.done, outstanding },
    dropCandidates: candidates
      .map((c) => ({ evaluatee: personRef(people, c.evaluateeId), perspective: c.perspective, assignments: categories.get(categoryKey(c.evaluateeId, c.perspective))?.assignments.length ?? 0 }))
      .sort((a, b) => byName(a.evaluatee, b.evaluatee) || a.perspective.localeCompare(b.perspective)),
    lowCoverage: coverage.filter((c) => c.lowEvidence && c.satisfied > 0),
    lastRun: lastRun && {
      id: lastRun.id, at: lastRun.createdAt.toISOString(), runBy: runner?.name ?? 'Unknown',
      counts: lastRun.counts as unknown as AggregationCounts, drops: Array.isArray(lastRun.drops) ? lastRun.drops.length : 0,
    },
    canClose: running && !period.isLocked && !hasBlockers(blockers),
  }
}

export async function closeCycle(
  actor: WeeklyActor,
  cycleId: string,
  input: { drops: ReadonlyArray<{ evaluateeId: string; perspective: Perspective }>; formsAcknowledged?: boolean },
  now: Date,
): Promise<{ runId: string; counts: AggregationCounts; drops: DropRecord[] }> {
  assertHr(actor)
  const cycle = await loadCycle(cycleId)
  if (cycle.status !== 'RUNNING') throw new WeeklyError('This quarter is already closed', 409)
  // The 72-hour wait ends at close (a ruling: these scores need no review, so they are accepted now).
  await autoAcceptDue(now, { cycleId, ignoreWait: true })
  const view = await closeView(actor, cycleId, now)
  if (view.periodLocked) throw new WeeklyError('Unlock the evaluation period first: a locked period ignores dropped groups', 409)
  if (hasBlockers(view.blockers)) throw new WeeklyError(`Resolve these first: ${describe(view.blockers)}`, 409)
  // Forms cannot be filled once the quarter closes, and a missing form's group keeps its weight, so HR confirms knowingly.
  if (view.forms.outstanding.length > 0 && input.formsAcknowledged !== true) {
    const missing = view.forms.total - view.forms.done
    throw new WeeklyError(`${missing} end-of-quarter form${missing === 1 ? ' is' : 's are'} not submitted yet (${view.forms.outstanding.join(', ')}). They cannot be filled after the close. Confirm to close anyway.`, 409)
  }
  const candidateKeys = new Set(view.dropCandidates.map((c) => categoryKey(c.evaluatee.id, c.perspective)))
  for (const drop of input.drops) {
    if (!candidateKeys.has(categoryKey(drop.evaluateeId, drop.perspective))) throw new WeeklyError('Someone’s evidence changed since the page loaded. Reload and try again.', 409)
  }
  const categories = await weeklyCategories(cycle, now)
  return prisma.$transaction(
    async (tx) => {
      // Serialises concurrent closes: the second waits here, then sees the cycle closed.
      const [row] = await tx.$queryRaw<Array<{ status: string }>>`SELECT status::text AS status FROM "WeeklyCycle" WHERE id = ${cycleId} FOR UPDATE`
      if (row?.status !== 'RUNNING') throw new WeeklyError('This quarter is already closed', 409)
      await tx.weeklyPrompt.updateMany({ where: { cycleId, status: { in: ['OPEN', 'DRAFT'] } }, data: { status: 'EXPIRED' } })
      const drops: DropRecord[] = []
      for (const drop of input.drops) {
        const assignments = categories.get(categoryKey(drop.evaluateeId, drop.perspective))?.assignments ?? []
        for (const a of assignments) {
          const key = { periodId: cycle.periodId, evaluatorId: a.evaluatorId, evaluateeId: a.evaluateeId, relationshipType: a.relationshipType }
          await tx.evaluationPeriodAssignmentOverride.upsert({
            where: { periodId_evaluatorId_evaluateeId_relationshipType: key },
            create: { ...key, action: 'REMOVE', note: DROP_NOTE, createdById: actor.id },
            update: { action: 'REMOVE', note: DROP_NOTE, createdById: actor.id },
          })
        }
        drops.push({ evaluateeId: drop.evaluateeId, perspective: drop.perspective, overrides: assignments.length })
      }
      const result = await aggregateCycle(tx, cycle, { runById: actor.id, now, drops })
      await tx.weeklyCycle.update({ where: { id: cycleId }, data: { status: 'CLOSED', closedAt: now } })
      await recordAudit(tx, { cycleId, actorId: actor.id, actorRole: 'HR', action: 'CYCLE_CLOSE', objectType: 'WeeklyCycle', objectId: cycleId, after: { counts: result.counts, drops } })
      return { ...result, drops }
    },
    { timeout: 120_000, maxWait: 10_000 },
  )
}

/** Dropped groups stay dropped (their REMOVE overrides remain; HR can delete them on the Performance page). */
export async function reopenCycle(actor: WeeklyActor, cycleId: string, now: Date): Promise<void> {
  assertHr(actor)
  const cycle = await loadCycle(cycleId)
  if (cycle.status !== 'CLOSED') throw new WeeklyError('Only a closed quarter can be reopened', 409)
  if (cycle.resultsPublishedAt) throw new WeeklyError('Results are published. Handle changes as challenges.', 409)
  const period = await prisma.evaluationPeriod.findUniqueOrThrow({ where: { id: cycle.periodId }, select: { isLocked: true } })
  if (period.isLocked) throw new WeeklyError('Unlock the evaluation period first', 409)
  if ((await prisma.weeklyCycle.count({ where: { status: 'RUNNING', id: { not: cycleId } } })) > 0) throw new WeeklyError('Another weekly quarter is running', 409)
  await prisma.$transaction(async (tx) => {
    const moved = await tx.weeklyCycle.updateMany({ where: { id: cycleId, status: 'CLOSED', resultsPublishedAt: null }, data: { status: 'RUNNING', closedAt: null } })
    if (moved.count === 0) throw new WeeklyError('This quarter changed. Reload and try again.', 409)
    await recordAudit(tx, { cycleId, actorId: actor.id, actorRole: 'HR', action: 'CYCLE_REOPEN', objectType: 'WeeklyCycle', objectId: cycleId, after: { at: now.toISOString() } })
  })
}

/** Starts the challenge window (D14). HR sends the reports first with the existing Email page. */
export async function publishResults(actor: WeeklyActor, cycleId: string, now: Date): Promise<{ challengeDeadline: string }> {
  assertHr(actor)
  const cycle = await loadCycle(cycleId)
  if (cycle.status !== 'CLOSED') throw new WeeklyError('Close the quarter first', 409)
  const moved = await prisma.weeklyCycle.updateMany({ where: { id: cycleId, status: 'CLOSED', resultsPublishedAt: null }, data: { resultsPublishedAt: now } })
  if (moved.count === 0) throw new WeeklyError('Results are already published', 409)
  await recordAudit(prisma, { cycleId, actorId: actor.id, actorRole: 'HR', action: 'RESULTS_PUBLISHED', objectType: 'WeeklyCycle', objectId: cycleId })
  return { challengeDeadline: (await challengeDeadlineFor(now)).toISOString() }
}
