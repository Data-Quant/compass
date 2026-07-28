import test from 'node:test'
import assert from 'node:assert/strict'
import { assembleDossier } from '../app/api/admin/analytics/employee-360/_assemble'

const selectedPeriod = {
  id: 'period-current',
  name: 'H1 2026',
  startDate: new Date('2026-01-01T00:00:00.000Z'),
  endDate: new Date('2026-06-30T00:00:00.000Z'),
  isActive: true,
  submittedScoreCount: 10,
}

function emptyAnalytics() {
  const currentMatrix = {
    periodId: selectedPeriod.id,
    periodName: selectedPeriod.name,
    scores: [],
  }
  return {
    matrices: [currentMatrix],
    currentMatrix,
    previousMatrix: null,
    previousPeriod: null,
    assignments: [],
    ratingRows: [],
    calibration: {
      orgMeanRating: 0,
      totalRatings: 0,
      distribution: [],
      fourRatingShare: 0,
      lensMeans: [],
      allEvaluators: [],
      mostLenient: [],
      mostSevere: [],
      evaluatorsAtCap: 0,
      evaluatorsNearCap: 0,
      insufficientData: true,
    },
    blindSpots: {
      entries: [],
      bySpread: [],
      bySelfGap: [],
      topSelfGaps: [],
      topSpreads: [],
      orgPerLensAverage: {},
      insufficientData: true,
    },
    orgPerLensAverageByPeriod: new Map([[selectedPeriod.id, {}]]),
    talentGrid: { entries: [], insufficientData: true },
  }
}

function emptyRows() {
  const now = new Date('2026-07-28T12:00:00.000Z')
  return {
    now,
    recentSince: new Date('2026-04-29T12:00:00.000Z'),
    yearStart: new Date('2026-01-01T00:00:00.000Z'),
    yearEnd: new Date('2026-12-31T00:00:00.000Z'),
    users: [
      {
        id: 'employee-a',
        name: 'Synthetic Person',
        department: 'Investments',
        position: 'Associate',
        teamTag: null,
        payrollProfile: null,
      },
    ],
    clientAssignments: [],
    colleagueAssignments: [],
    mappingRows: [],
    payrollReceipts: [],
    openTasks: [],
    completedTasks: [],
    leaveRequests: [],
    selfEvaluations: [],
  }
}

test('assembler keeps sparse domains explicit and treats a missing payroll profile as active', () => {
  const rows = emptyRows()
  const dossier = assembleDossier({
    employeeId: 'employee-a',
    generatedAt: rows.now,
    periods: [selectedPeriod],
    selectedPeriod,
    analytics: emptyAnalytics() as never,
    rows: rows as never,
  })

  assert.equal(dossier.employment.status, 'ACTIVE')
  assert.equal(dossier.availability.evaluation, 'NO_DATA')
  assert.equal(dossier.signals.performance, null)
  assert.deepEqual(dossier.evaluation.history, [])
  assert.equal(dossier.availability.compensation, 'NO_DATA')
  assert.equal(dossier.compensation.currentBasic, null)
  assert.equal(dossier.operations.openTasks, 0)
  assert.equal(dossier.signals.dataCompleteness, 0.2)
})

test('assembler emits anonymous evaluator nodes and keeps SELF out of the overall score', () => {
  const rows = emptyRows()
  const analytics = emptyAnalytics()
  analytics.currentMatrix.scores = [
    {
      employeeId: 'employee-a',
      department: 'Investments',
      overallScore: 75,
      perLens: {
        PEER: { normalizedScore: 3, evaluatorCount: 1 },
        SELF: { normalizedScore: 4, evaluatorCount: 1 },
      },
      weights: { PEER: 1, SELF: 0 },
    },
  ]
  analytics.assignments = [
    {
      evaluatorId: 'employee-rater',
      evaluateeId: 'employee-a',
      relationshipType: 'PEER',
    },
  ]
  analytics.ratingRows = [
    {
      evaluatorId: 'employee-rater',
      evaluateeId: 'employee-a',
      ratingValue: 3,
      leadQuestionId: null,
      question: { relationshipType: 'PEER' },
      relationshipType: 'PEER',
    },
  ]
  analytics.calibration.allEvaluators = [
    {
      evaluatorId: 'employee-rater',
      ratingCount: 1,
      meanRating: 3,
      deviation: 0,
      perLens: [],
      isProvisional: true,
      fourRatingCount: 0,
      isExempt: false,
    },
  ]
  analytics.talentGrid.entries = [
    {
      employeeId: 'employee-a',
      department: 'Investments',
      performanceScore: 75,
      performanceBand: 'MID',
      momentumDelta: null,
      momentumBand: null,
      consensus: null,
      cellLabel: null,
      isNew: false,
    },
  ]

  const dossier = assembleDossier({
    employeeId: 'employee-a',
    generatedAt: rows.now,
    periods: [selectedPeriod],
    selectedPeriod,
    analytics: analytics as never,
    rows: rows as never,
  })

  assert.equal(dossier.evaluation.overallScore, 75)
  assert.equal(dossier.evaluation.selfVsOthersGap, 1)
  assert.equal(
    dossier.evaluation.lenses.find((lens) => lens.relationshipType === 'SELF')
      ?.includedInOverall,
    false
  )
  const evaluatorEdge = dossier.network.edges.find(
    (edge) => edge.kind === 'EVALUATOR'
  )
  assert.ok(evaluatorEdge)
  assert.equal(evaluatorEdge.person.identityRevealed, false)
  assert.equal(evaluatorEdge.person.employeeId, null)
  assert.equal(evaluatorEdge.person.position, null)
  assert.equal(evaluatorEdge.person.name, 'Peer evaluator')
})
