import { approveProfile, contentView, syncFromQuestionBank } from '../../lib/weekly/service/content'
import { createCycle, updateCycle } from '../../lib/weekly/service/cycles'
import { W, weeklyActor } from './weekly-test-db'

export const HR_ACTOR = weeklyActor(W.hr)
export const WEEK_ONE_MONDAY = '2026-10-05'

const WEEK_ONE_MS = Date.UTC(2026, 9, 5) - 5 * 60 * 60 * 1000 // Monday 5 Oct 2026, 00:00 Karachi
const DAY_MS = 24 * 60 * 60 * 1000

/** An instant in the test cycle: `weekday` 1 = Monday … 7 = Sunday, `hour` in Karachi time. */
export function at(week: number, weekday = 1, hour = 9): Date {
  return new Date(WEEK_ONE_MS + ((week - 1) * 7 + (weekday - 1)) * DAY_MS + hour * 60 * 60 * 1000)
}

export async function approveAllContent(): Promise<void> {
  for (const competency of (await contentView(HR_ACTOR)).competencies) {
    if (competency.draft) await approveProfile(HR_ACTOR, competency.draft.id)
  }
}

/** Sync and approve every topic, then create and start a cycle whose week 1 is 5 October 2026. */
export async function startedCycle(periodId: string, weeklyCap = 5): Promise<{ cycleId: string }> {
  await syncFromQuestionBank(HR_ACTOR)
  await approveAllContent()
  const cycle = await createCycle(HR_ACTOR, { periodId, weekOneStartsOn: WEEK_ONE_MONDAY, weeklyCap })
  await updateCycle(HR_ACTOR, cycle.id, { action: 'start' })
  return { cycleId: cycle.id }
}
