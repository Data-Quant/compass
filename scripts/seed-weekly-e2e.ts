// Seeds synthetic people, mappings, a question bank and a quarter for the weekly-evaluations Playwright run.
// Refuses any database other than the local compass_kpi_test.
import { PrismaClient, type RelationshipType } from '@prisma/client'
import bcrypt from 'bcryptjs'

const PEOPLE = [
  ['wkle-hr', 'E2E Weekly HR', 'HR', 'HR Executive', 'Human Resources'],
  ['wkle-lead', 'E2E Weekly Lead', 'EMPLOYEE', 'Lead', 'Product'],
  ['wkle-ana', 'E2E Weekly Ana', 'EMPLOYEE', 'Analyst', 'Product'],
  ['wkle-ben', 'E2E Weekly Ben', 'EMPLOYEE', 'Analyst', 'Product'],
  ['wkle-chief', 'E2E Weekly Chief', 'EMPLOYEE', 'Chief Executive', 'Leadership'],
] as const

const MAPPINGS: Array<[string, string, RelationshipType]> = [
  ['wkle-lead', 'wkle-ana', 'TEAM_LEAD'], ['wkle-ana', 'wkle-lead', 'DIRECT_REPORT'],
  ['wkle-lead', 'wkle-ben', 'TEAM_LEAD'], ['wkle-ben', 'wkle-lead', 'DIRECT_REPORT'],
  ['wkle-ana', 'wkle-ben', 'PEER'], ['wkle-ben', 'wkle-ana', 'PEER'],
  ['wkle-chief', 'wkle-ana', 'C_LEVEL'], ['wkle-chief', 'wkle-ben', 'C_LEVEL'], ['wkle-hr', 'wkle-ana', 'HR'],
]

const BANK: Array<[RelationshipType, string, 'RATING' | 'TEXT']> = [
  ['DIRECT_REPORT', 'Quality of Work', 'RATING'], ['DIRECT_REPORT', 'Initiative & Proactivity', 'RATING'],
  ['DIRECT_REPORT', 'Team Collaboration', 'RATING'], ['DIRECT_REPORT', 'Feedback', 'TEXT'],
  ['TEAM_LEAD', 'Clarity in Communication', 'RATING'], ['TEAM_LEAD', 'Support for Professional Growth', 'RATING'],
  ['TEAM_LEAD', 'Recognition & Appreciation', 'RATING'], ['TEAM_LEAD', 'Leadership & Problem Solving', 'RATING'],
  ['TEAM_LEAD', 'Comments', 'TEXT'],
  ['PEER', 'Collaboration & Teamwork', 'RATING'], ['PEER', 'Communication', 'RATING'], ['PEER', 'Reliability', 'RATING'],
  ['PEER', 'Areas for Improvement', 'TEXT'],
  ['C_LEVEL', 'Strategic contribution', 'RATING'], ['C_LEVEL', 'Ownership', 'RATING'], ['C_LEVEL', 'Comments for the person', 'TEXT'], ['HR', 'Policy adherence', 'RATING'],
]

export const E2E_PERIOD = 'Q4 2026 (weekly e2e)'

function isLocalTestDb(url: string | undefined): boolean {
  try {
    const parsed = new URL(url ?? '')
    return ['127.0.0.1', 'localhost'].includes(parsed.hostname) && parsed.pathname === '/compass_kpi_test'
  } catch {
    return false
  }
}

/** Monday 00:00 of the current week in Karachi, as a UTC instant. */
function thisMondayKarachi(now: Date): Date {
  const karachi = new Date(now.getTime() + 5 * 60 * 60 * 1000)
  const back = (karachi.getUTCDay() + 6) % 7
  return new Date(Date.UTC(karachi.getUTCFullYear(), karachi.getUTCMonth(), karachi.getUTCDate() - back) - 5 * 60 * 60 * 1000)
}

async function main(): Promise<void> {
  if (!isLocalTestDb(process.env.DATABASE_URL)) throw new Error('Refusing: DATABASE_URL must be the local compass_kpi_test database')
  const password = process.env.KPI_FIXTURE_PASSWORD
  if (!password || password.length < 12) throw new Error('Set KPI_FIXTURE_PASSWORD (at least 12 characters)')
  const db = new PrismaClient()
  try {
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
    await db.weeklyPairWindow.deleteMany()
    await db.weeklyParticipantOverride.deleteMany()
    await db.weeklyNotification.deleteMany()
    await db.weeklyAuditEvent.deleteMany()
    await db.weeklyAggregationRun.deleteMany()
    await db.weeklyChallenge.deleteMany()
    await db.weeklyCycle.deleteMany()
    // A previous run's close wrote evaluations, reports and overrides for the old period; clear them first.
    const oldPeriodIds = (await db.evaluationPeriod.findMany({ where: { name: E2E_PERIOD }, select: { id: true } })).map((p) => p.id)
    await db.evaluationPeriodAssignmentOverride.deleteMany({ where: { periodId: { in: oldPeriodIds } } })
    await db.report.deleteMany({ where: { periodId: { in: oldPeriodIds } } })
    await db.evaluation.deleteMany({ where: { OR: [{ periodId: { in: oldPeriodIds } }, { evaluatorId: { startsWith: 'wkle-' } }, { evaluateeId: { startsWith: 'wkle-' } }] } })
    await db.evaluationPeriod.deleteMany({ where: { name: E2E_PERIOD } })
    await db.evaluationQuestion.deleteMany({ where: { orderIndex: { gte: 900 } } })
    await db.evaluatorMapping.deleteMany({ where: { OR: [{ evaluatorId: { startsWith: 'wkle-' } }, { evaluateeId: { startsWith: 'wkle-' } }] } })
    await db.user.deleteMany({ where: { id: { startsWith: 'wkle-' } } })
    const passwordHash = await bcrypt.hash(password, 10)
    for (const [id, name, role, position, department] of PEOPLE) {
      await db.user.create({ data: { id, name, email: `${id}@example.test`, role, position, department, passwordHash, onboardingCompleted: true } })
    }
    for (const [evaluatorId, evaluateeId, relationshipType] of MAPPINGS) {
      await db.evaluatorMapping.create({ data: { evaluatorId, evaluateeId, relationshipType } })
    }
    for (const [index, [relationshipType, questionText, questionType]] of BANK.entries()) {
      await db.evaluationQuestion.create({ data: { relationshipType, questionText, questionType, orderIndex: 900 + index } })
    }
    const monday = thisMondayKarachi(new Date())
    const endDate = new Date(monday.getTime() + 90 * 24 * 60 * 60 * 1000)
    await db.evaluationPeriod.create({
      data: { name: E2E_PERIOD, startDate: monday, endDate, reviewStartDate: new Date(endDate.getTime() + 5 * 24 * 60 * 60 * 1000), isActive: false },
    })
    console.log(`Seeded weekly e2e people, bank and "${E2E_PERIOD}" starting ${monday.toISOString()}`)
  } finally {
    await db.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
