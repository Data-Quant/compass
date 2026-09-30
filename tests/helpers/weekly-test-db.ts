import type { PrismaClient, RelationshipType } from '@prisma/client'
import type { WeeklyActor } from '../../lib/weekly/service/context'
import { isKpiTestDatabase } from './kpi-test-db'

export const WEEKLY_DB_READY = process.env.KPI_DB_TEST === 'true' && isKpiTestDatabase(process.env.DATABASE_URL)
export const WEEKLY_DB_TEST = { skip: WEEKLY_DB_READY ? false : 'Set KPI_DB_TEST=true and DATABASE_URL to the local compass_kpi_test database' }

type Role = 'EMPLOYEE' | 'HR' | 'EXECUTION'
export interface WeeklyTestPerson { id: string; name: string; role: Role; position: string; department: string }

/** Fictional people only: the repository is public. */
export const W = {
  hr: { id: 'wkt-hr', name: 'Hana Reyes', role: 'HR', position: 'HR Executive', department: 'Human Resources' },
  lead: { id: 'wkt-lead', name: 'Layla Mercer', role: 'EMPLOYEE', position: 'Lead', department: 'Product' },
  ana: { id: 'wkt-ana', name: 'Ana Torvik', role: 'EMPLOYEE', position: 'Analyst', department: 'Product' },
  ben: { id: 'wkt-ben', name: 'Ben Okafor', role: 'EMPLOYEE', position: 'Analyst', department: 'Product' },
  cara: { id: 'wkt-cara', name: 'Cara Lindqvist', role: 'EMPLOYEE', position: 'Analyst', department: 'Design' },
} satisfies Record<string, WeeklyTestPerson>

export const WEEKLY_PERIOD = {
  name: 'Q4 2026 (weekly test)',
  startDate: new Date('2026-10-01T00:00:00.000Z'),
  endDate: new Date('2026-12-31T00:00:00.000Z'),
  reviewStartDate: new Date('2027-01-05T00:00:00.000Z'),
}

/** The seeded bank titles; orderIndex from 900 keeps them apart from any other rows. */
export const BANK: Array<{ relationshipType: RelationshipType; questionText: string; questionType: 'RATING' | 'TEXT'; descriptions?: [string, string, string, string] }> = [
  { relationshipType: 'DIRECT_REPORT', questionText: 'Quality of Work', questionType: 'RATING' },
  { relationshipType: 'DIRECT_REPORT', questionText: 'Initiative & Proactivity', questionType: 'RATING' },
  { relationshipType: 'DIRECT_REPORT', questionText: 'Team Collaboration', questionType: 'RATING' },
  {
    relationshipType: 'DIRECT_REPORT', questionText: 'Client Communication', questionType: 'RATING',
    descriptions: ['Clients chase for updates.', 'Updates clients when asked.', '', 'Clients cite their updates as a model.'],
  },
  { relationshipType: 'DIRECT_REPORT', questionText: 'Feedback', questionType: 'TEXT' },
  { relationshipType: 'TEAM_LEAD', questionText: 'Clarity in Communication', questionType: 'RATING' },
  { relationshipType: 'TEAM_LEAD', questionText: 'Support for Professional Growth', questionType: 'RATING' },
  { relationshipType: 'TEAM_LEAD', questionText: 'Recognition & Appreciation', questionType: 'RATING' },
  { relationshipType: 'TEAM_LEAD', questionText: 'Leadership & Problem Solving', questionType: 'RATING' },
  { relationshipType: 'TEAM_LEAD', questionText: 'Comments', questionType: 'TEXT' },
  { relationshipType: 'PEER', questionText: 'Collaboration & Teamwork', questionType: 'RATING' },
  { relationshipType: 'PEER', questionText: 'Communication', questionType: 'RATING' },
  { relationshipType: 'PEER', questionText: 'Reliability', questionType: 'RATING' },
  { relationshipType: 'PEER', questionText: 'Areas for Improvement', questionType: 'TEXT' },
]

export function weeklyActor(person: WeeklyTestPerson): WeeklyActor {
  return { id: person.id, name: person.name, role: person.role, position: person.position, department: person.department }
}

export async function resetWeeklyTestData(db: PrismaClient): Promise<void> {
  if (!isKpiTestDatabase(process.env.DATABASE_URL)) throw new Error('Refusing to reset a database that is not compass_kpi_test')
  await db.weeklyCalibrationResult.deleteMany()
  await db.weeklyCalibrationRun.deleteMany()
  await db.weeklyCalibrationItem.deleteMany()
  await db.weeklyAiSettings.deleteMany()
  await db.weeklyScoreReview.deleteMany()
  await db.weeklyAiScore.deleteMany()
  await db.weeklyScoringJob.deleteMany()
  await db.weeklyResponse.deleteMany()
  await db.weeklyPrompt.deleteMany()
  await db.weeklyRelease.deleteMany()
  await db.weeklySlot.deleteMany()
  await db.weeklyProfile.deleteMany()
  await db.weeklyCompetencyPrompt.deleteMany()
  await db.weeklyCompetency.deleteMany()
  await db.weeklyParticipantOverride.deleteMany()
  await db.weeklyNotification.deleteMany()
  await db.weeklyAuditEvent.deleteMany()
  await db.weeklyAggregationRun.deleteMany()
  await db.weeklyChallenge.deleteMany()
  await db.weeklyCycle.deleteMany()
  await db.evaluation.deleteMany({ where: { OR: [{ evaluatorId: { startsWith: 'wkt-' } }, { evaluateeId: { startsWith: 'wkt-' } }] } })
  await db.evaluationPeriod.deleteMany({ where: { name: WEEKLY_PERIOD.name } })
  await db.evaluationQuestion.deleteMany({ where: { orderIndex: { gte: 900 } } })
  // Weekly services read every evaluator mapping (mappings are not per period), so other suites'
  // leftover fixtures (KPI or weekly e2e seeds, which re-create their own) would leak into these tests.
  await db.evaluatorMapping.deleteMany()
  await db.payrollEmployeeProfile.deleteMany({ where: { userId: { startsWith: 'wkt-' } } })
  await db.user.deleteMany({ where: { id: { startsWith: 'wkt-' } } })
}

/** People, a lead with two reports (both directions), two peers (both directions), the bank and the Q4 period. */
export async function seedWeeklyBase(db: PrismaClient): Promise<{ periodId: string }> {
  for (const person of Object.values(W)) {
    await db.user.create({ data: { ...person, email: `${person.id}@example.test`, onboardingCompleted: true } })
  }
  const pairs: Array<[string, string, RelationshipType]> = [
    [W.lead.id, W.ana.id, 'TEAM_LEAD'], [W.ana.id, W.lead.id, 'DIRECT_REPORT'],
    [W.lead.id, W.ben.id, 'TEAM_LEAD'], [W.ben.id, W.lead.id, 'DIRECT_REPORT'],
    [W.ana.id, W.ben.id, 'PEER'], [W.ben.id, W.ana.id, 'PEER'],
  ]
  for (const [evaluatorId, evaluateeId, relationshipType] of pairs) {
    await db.evaluatorMapping.create({ data: { evaluatorId, evaluateeId, relationshipType } })
  }
  for (const [index, question] of BANK.entries()) {
    const [d1, d2, d3, d4] = question.descriptions ?? [null, null, null, null]
    await db.evaluationQuestion.create({
      data: {
        relationshipType: question.relationshipType, questionText: question.questionText, questionType: question.questionType,
        orderIndex: 900 + index, rating1Description: d1 || null, rating2Description: d2 || null, rating3Description: d3 || null, rating4Description: d4 || null,
      },
    })
  }
  const period = await db.evaluationPeriod.create({ data: { ...WEEKLY_PERIOD, isActive: false } })
  return { periodId: period.id }
}
