// One-off, preview only: removes what the deleted classic questionnaire left in the database. Finished quarters keep
// their results (any period with reports), and weekly quarters are never touched (their form drafts are live data).
import { prisma } from '@/lib/db'
import { assertTestTools } from './test-tools'
import type { WeeklyActor } from './context'

export interface ClassicPeriodData { periodId: string; periodName: string; reports: number; submittedAnswers: number; drafts: number; removable: boolean }

export async function classicDataReport(actor: WeeklyActor): Promise<ClassicPeriodData[]> {
  assertTestTools(actor)
  const [periods, cycles] = await Promise.all([
    prisma.evaluationPeriod.findMany({ orderBy: { startDate: 'desc' }, select: { id: true, name: true } }),
    prisma.weeklyCycle.findMany({ select: { periodId: true } }),
  ])
  const weekly = new Set(cycles.map((c) => c.periodId))
  const rows: ClassicPeriodData[] = []
  for (const period of periods.filter((p) => !weekly.has(p.id))) {
    const [reports, submittedAnswers, drafts] = await Promise.all([
      prisma.report.count({ where: { periodId: period.id } }),
      prisma.evaluation.count({ where: { periodId: period.id, source: 'MANUAL', submittedAt: { not: null } } }),
      prisma.evaluation.count({ where: { periodId: period.id, source: 'MANUAL', submittedAt: null } }),
    ])
    rows.push({ periodId: period.id, periodName: period.name, reports, submittedAnswers, drafts, removable: reports === 0 })
  }
  return rows
}

/** Deletes classic drafts in every non-weekly period, and all classic answers in unfinished ones (no reports). */
export async function purgeClassicData(actor: WeeklyActor): Promise<{ deletedAnswers: number; deletedDrafts: number; periods: string[] }> {
  const report = await classicDataReport(actor)
  const unfinished = report.filter((r) => r.removable).map((r) => r.periodId)
  const nonWeekly = report.map((r) => r.periodId)
  return prisma.$transaction(async (tx) => {
    const drafts = await tx.evaluation.deleteMany({ where: { periodId: { in: nonWeekly }, source: 'MANUAL', submittedAt: null } })
    const answers = await tx.evaluation.deleteMany({ where: { periodId: { in: unfinished }, source: 'MANUAL' } })
    return { deletedAnswers: answers.count, deletedDrafts: drafts.count, periods: report.filter((r) => r.removable).map((r) => r.periodName) }
  })
}
