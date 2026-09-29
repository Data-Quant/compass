import { prisma } from '@/lib/db'
import { effectiveWeek, totalWeeks } from '../calendar'
import { syntheticAnswer, syntheticComment } from '../content/synthetic'
import { areWeeklyTestToolsEnabled } from '../flag'
import { recordAudit } from './audit'
import { approveProfile } from './content'
import { assertHr, type WeeklyActor } from './context'
import { loadCycle } from './cycles'
import { WeeklyError } from './errors'
import { submitAnswer } from './inbox'
import { releaseWeek, type ReleaseSummary } from './release'

/** Preview-only: refuses unless WEEKLY_TEST_TOOLS is on, and only for HR. */
export function assertTestTools(actor: WeeklyActor): void {
  if (!areWeeklyTestToolsEnabled()) throw new WeeklyError('Test tools are off', 404)
  assertHr(actor)
}

export async function releaseNextWeek(actor: WeeklyActor, cycleId: string, now: Date): Promise<ReleaseSummary> {
  assertTestTools(actor)
  const cycle = await loadCycle(cycleId)
  const total = totalWeeks(cycle.weekOneStartsOn, cycle.period.endDate)
  const last = (await prisma.weeklyRelease.aggregate({ where: { cycleId }, _max: { weekIndex: true } }))._max.weekIndex ?? 0
  const week = last === 0 ? Math.min(total, Math.max(1, effectiveWeek(cycle.weekOneStartsOn, cycle.simulatedWeek, now))) : last + 1
  if (week > total) throw new WeeklyError('Every week of this cycle has been released', 409)
  await prisma.weeklyCycle.update({ where: { id: cycleId }, data: { simulatedWeek: week } })
  const summary = await releaseWeek(cycleId, week, now)
  await recordAudit(prisma, { cycleId, actorId: actor.id, actorRole: 'HR', action: 'TEST_RELEASE_WEEK', objectType: 'WeeklyCycle', objectId: cycleId, after: summary })
  return summary
}

export async function fillSynthetic(actor: WeeklyActor, cycleId: string, evaluatorId: string | undefined, now: Date): Promise<{ answered: number }> {
  assertTestTools(actor)
  const prompts = await prisma.weeklyPrompt.findMany({
    where: { cycleId, status: { in: ['OPEN', 'DRAFT'] }, ...(evaluatorId ? { evaluatorId } : {}) },
    include: { slot: { select: { competency: { select: { name: true } } } } },
    orderBy: { createdAt: 'asc' },
  })
  for (const prompt of prompts) {
    const input =
      prompt.kind === 'COMMENT'
        ? { situation: '', action: '', result: '', commentText: syntheticComment(prompt.id) }
        : (({ situation, action, result, shortfall }) => ({ situation, action, result, shortfall: shortfall || null }))(syntheticAnswer(prompt.id, prompt.slot?.competency.name ?? 'the work'))
    await submitAnswer(actor, { evaluatorId: prompt.evaluatorId, actingAs: true }, prompt.id, input, now)
  }
  await recordAudit(prisma, { cycleId, actorId: actor.id, actorRole: 'HR', action: 'TEST_FILL', objectType: 'WeeklyCycle', objectId: cycleId, after: { evaluatorId: evaluatorId ?? null, answered: prompts.length } })
  return { answered: prompts.length }
}

export async function approveAllDrafts(actor: WeeklyActor): Promise<{ approved: number }> {
  assertTestTools(actor)
  const drafts = await prisma.weeklyProfile.findMany({ where: { status: 'DRAFT' }, select: { id: true } })
  for (const draft of drafts) await approveProfile(actor, draft.id)
  return { approved: drafts.length }
}

export async function resetCycle(actor: WeeklyActor, cycleId: string): Promise<void> {
  assertTestTools(actor)
  await loadCycle(cycleId)
  const promptIds = (await prisma.weeklyPrompt.findMany({ where: { cycleId }, select: { id: true } })).map((p) => p.id)
  const responseIds = (await prisma.weeklyResponse.findMany({ where: { promptId: { in: promptIds } }, select: { id: true } })).map((r) => r.id)
  await prisma.$transaction([
    prisma.weeklyScoreReview.deleteMany({ where: { responseId: { in: responseIds } } }),
    prisma.weeklyAiScore.deleteMany({ where: { responseId: { in: responseIds } } }),
    prisma.weeklyScoringJob.deleteMany({ where: { responseId: { in: responseIds } } }),
    prisma.weeklyResponse.deleteMany({ where: { id: { in: responseIds } } }),
    prisma.weeklyPrompt.deleteMany({ where: { cycleId } }),
    prisma.weeklyRelease.deleteMany({ where: { cycleId } }),
    prisma.weeklySlot.deleteMany({ where: { cycleId } }),
    prisma.weeklyCycle.update({ where: { id: cycleId }, data: { simulatedWeek: null } }),
  ])
  await recordAudit(prisma, { cycleId, actorId: actor.id, actorRole: 'HR', action: 'TEST_RESET', objectType: 'WeeklyCycle', objectId: cycleId })
}
