import test from 'node:test'
import assert from 'node:assert/strict'
import {
  availabilitySchema,
  directoryPayloadSchema,
  employeeDossierSchema,
  evaluationLensSchema,
  evidencePayloadSchema,
  personNodeSchema,
  profilePayloadSchema,
} from '../lib/analytics/employee-360-contracts'

const now = '2026-07-28T12:00:00.000Z'
const period = {
  id: 'period-q2',
  name: 'Q2 2026',
  startDate: '2026-04-01T00:00:00.000Z',
  endDate: '2026-06-30T00:00:00.000Z',
  isActive: true,
}

function sparseDossier() {
  return {
    identity: {
      id: 'employee-1',
      name: 'Synthetic Employee',
      department: null,
      position: null,
      teamTag: null,
    },
    employment: {
      status: 'ACTIVE',
      joinedAt: null,
      exitedAt: null,
    },
    availability: {
      evaluation: 'PARTIAL',
      clients: 'NO_DATA',
      compensation: 'NO_DATA',
      operations: 'AVAILABLE',
      network: 'NO_DATA',
    },
    signals: {
      performance: null,
      momentum: null,
      evaluatorConsensus: null,
      clientFootprint: null,
      currentCompensation: null,
      compensationChange: null,
      workload: {
        openTasks: 0,
        overdueTasks: 0,
        recentCompletions: 0,
      },
      dataCompleteness: 0.3,
    },
    evaluation: {
      period,
      overallScore: null,
      performanceBand: null,
      momentumDelta: null,
      momentumBand: null,
      consensus: null,
      companyBaseline: null,
      selfVsOthersGap: null,
    },
    clientFootprint: {
      concentration: null,
      outcomeEvidenceAvailable: false,
    },
    compensation: {
      currency: null,
      currentBasic: null,
      growth: null,
    },
    operations: {
      asOf: now,
      openTasks: 0,
      overdueTasks: 0,
      recentCompletions: 0,
      approvedWorkingLeaveDays: 0,
      approvedLeaveRequests: 0,
    },
    network: {},
  }
}

test('availability is explicit and cannot silently become a numeric zero', () => {
  assert.equal(availabilitySchema.parse('AVAILABLE'), 'AVAILABLE')
  assert.equal(availabilitySchema.parse('PARTIAL'), 'PARTIAL')
  assert.equal(availabilitySchema.parse('NO_DATA'), 'NO_DATA')
  assert.equal(availabilitySchema.safeParse(0).success, false)
  assert.equal(availabilitySchema.safeParse(undefined).success, false)
})

test('directory payload defaults sparse arrays and validates employment coverage', () => {
  const empty = directoryPayloadSchema.parse({ generatedAt: now })
  assert.deepEqual(empty.periods, [])
  assert.deepEqual(empty.employees, [])

  const payload = directoryPayloadSchema.parse({
    generatedAt: now,
    periods: [period],
    employees: [
      {
        id: 'employee-1',
        name: 'Synthetic Employee',
        department: null,
        position: null,
        employmentStatus: 'ARCHIVED',
        dataCoverage: {
          evaluation: 'AVAILABLE',
          clients: 'PARTIAL',
          compensation: 'NO_DATA',
          operations: 'AVAILABLE',
          network: 'NO_DATA',
        },
      },
    ],
  })

  assert.equal(payload.employees[0].employmentStatus, 'ARCHIVED')
  assert.equal(payload.employees[0].dataCoverage.clients, 'PARTIAL')
})

test('a sparse dossier remains structurally complete and defaults domain arrays', () => {
  const dossier = employeeDossierSchema.parse(sparseDossier())

  assert.deepEqual(dossier.evaluation.lenses, [])
  assert.deepEqual(dossier.evaluation.history, [])
  assert.deepEqual(dossier.evaluation.raters, [])
  assert.deepEqual(dossier.clientFootprint.assignments, [])
  assert.deepEqual(dossier.clientFootprint.collaborators, [])
  assert.deepEqual(dossier.compensation.currencies, [])
  assert.deepEqual(dossier.compensation.history, [])
  assert.deepEqual(dossier.compensation.changeEvents, [])
  assert.deepEqual(dossier.network.edges, [])
  assert.deepEqual(dossier.timeline, [])
  assert.equal(dossier.signals.performance, null)
})

test('profile payload supports no comparison and strips fields outside the safe contract', () => {
  const input = sparseDossier() as ReturnType<typeof sparseDossier> & {
    identity: ReturnType<typeof sparseDossier>['identity'] & { accountNumber: string }
  }
  input.identity.accountNumber = 'must-not-cross-the-contract'

  const profile = profilePayloadSchema.parse({
    generatedAt: now,
    selectedPeriod: period,
    primary: input,
  })

  assert.equal(profile.comparison, undefined)
  assert.equal('accountNumber' in profile.primary.identity, false)
})

test('compensation zero is rejected instead of masquerading as evidence', () => {
  const dossier = sparseDossier()
  dossier.compensation.currency = 'PKR'
  dossier.compensation.currentBasic = 0

  assert.equal(employeeDossierSchema.safeParse(dossier).success, false)
})

test('NO_DATA cannot coexist with zero-valued domain evidence', () => {
  const dossier = sparseDossier()
  dossier.availability.evaluation = 'NO_DATA'
  dossier.signals.performance = 0
  dossier.evaluation.overallScore = 0

  assert.equal(employeeDossierSchema.safeParse(dossier).success, false)
})

test('SELF can be displayed but cannot be weighted into the overall score', () => {
  assert.equal(
    evaluationLensSchema.safeParse({
      relationshipType: 'SELF',
      score: 4,
      evaluatorCount: 1,
      orgAverage: null,
      weight: 0.25,
      includedInOverall: true,
    }).success,
    false
  )
})

test('profile period cannot label a dossier assembled from an older period', () => {
  const dossier = sparseDossier()
  const result = profilePayloadSchema.safeParse({
    generatedAt: now,
    selectedPeriod: {
      ...period,
      id: 'new-empty-period',
      name: 'Q3 2026',
    },
    primary: dossier,
  })

  assert.equal(result.success, false)
})

test('evidence preserves typed self-evaluation answers and provenance', () => {
  const evidence = evidencePayloadSchema.parse({
    generatedAt: now,
    employeeId: 'employee-1',
    period,
    domain: 'SELF_EVALUATION',
    lens: 'SELF',
    items: [
      {
        id: 'self-answer-1',
        lens: 'SELF',
        question: 'What goals did you own?',
        response: null,
        structuredResponse: {
          type: 'GOAL_TABLE',
          section: 'Goals',
          value: [
            {
              goal: 'Ship the cockpit',
              status: 'COMPLETED',
              comments: 'Released with tests',
            },
          ],
        },
        rating: null,
        evaluator: {
          raterKey: 'self',
          canReveal: false,
          isRevealed: false,
          name: null,
        },
        provenance: {
          source: 'SELF_EVALUATION',
          recordId: 'self-evaluation-1',
          submittedAt: now,
          periodId: period.id,
          periodName: period.name,
        },
      },
    ],
  })

  assert.equal(evidence.items[0].structuredResponse?.type, 'GOAL_TABLE')
  assert.equal(evidence.items[0].provenance.source, 'SELF_EVALUATION')
})

test('an evaluator name cannot leak before an explicit reveal', () => {
  const result = evidencePayloadSchema.safeParse({
    generatedAt: now,
    employeeId: 'employee-1',
    period,
    domain: 'EVALUATION',
    lens: 'PEER',
    items: [
      {
        id: 'evaluation-1',
        lens: 'PEER',
        question: 'How do they collaborate?',
        response: 'Synthetic response',
        rating: 3,
        evaluator: {
          raterKey: 'rater-1',
          canReveal: true,
          isRevealed: false,
          name: 'Should stay hidden',
        },
        provenance: {
          source: 'EVALUATION',
          recordId: 'evaluation-1',
          submittedAt: now,
          periodId: period.id,
          periodName: period.name,
        },
      },
    ],
  })

  assert.equal(result.success, false)
})

test('an anonymous evaluator network node cannot carry pivotable identity fields', () => {
  assert.equal(
    personNodeSchema.safeParse({
      employeeId: 'real-employee-id',
      name: 'Peer evaluator',
      position: null,
      identityRevealed: false,
    }).success,
    false
  )

  const anonymous = personNodeSchema.parse({
    employeeId: null,
    name: 'Peer evaluator',
    position: null,
    identityRevealed: false,
  })
  assert.equal(anonymous.employeeId, null)
})
