import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildRuntimeEvaluationQuestionSet,
  PRE_EVALUATION_QUESTION_COUNT,
  deriveLeadRelationships,
  filterLeadsByTitle,
  isLeadTitle,
  PRE_EVALUATION_LEAD_TITLES,
  derivePreEvaluationStatus,
  getDefaultQuestionBankRelationshipType,
  getLeadAuthoredQuestionBankRelationshipType,
  getRuntimeLeadQuestionCount,
  hasEffectiveLeadQuestionSet,
  hasSubmittedLeadQuestionSet,
  isPrepEligibleForCarryForward,
  resolvePrepQuestionPrefill,
  validatePreEvaluationSelections,
} from '../lib/pre-evaluation'

const CARRIED_AT = new Date('2026-07-01T00:00:00.000Z')
const SUBMITTED_AT = new Date('2026-07-02T00:00:00.000Z')
const oneQuestion = [{ id: 'q1' }]

test('hasEffectiveLeadQuestionSet counts submitted OR carried question sets', () => {
  // Lead explicitly submitted.
  assert.equal(
    hasEffectiveLeadQuestionSet({ questionsSubmittedAt: SUBMITTED_AT, questionsCarriedForwardAt: null, questions: oneQuestion }),
    true,
  )
  // Carried forward from a prior period (effective by default).
  assert.equal(
    hasEffectiveLeadQuestionSet({ questionsSubmittedAt: null, questionsCarriedForwardAt: CARRIED_AT, questions: oneQuestion }),
    true,
  )
  // Neither: not effective.
  assert.equal(
    hasEffectiveLeadQuestionSet({ questionsSubmittedAt: null, questionsCarriedForwardAt: null, questions: oneQuestion }),
    false,
  )
  // A flag with no questions is not effective.
  assert.equal(
    hasEffectiveLeadQuestionSet({ questionsSubmittedAt: SUBMITTED_AT, questionsCarriedForwardAt: null, questions: [] }),
    false,
  )
  assert.equal(
    hasEffectiveLeadQuestionSet({ questionsSubmittedAt: null, questionsCarriedForwardAt: CARRIED_AT, questions: [] }),
    false,
  )
})

test('isPrepEligibleForCarryForward is true only for untouched preps', () => {
  // Untouched: no questions, not submitted, not carried.
  assert.equal(
    isPrepEligibleForCarryForward({ questionsSubmittedAt: null, questionsCarriedForwardAt: null, questions: [] }),
    true,
  )
  // Already has questions.
  assert.equal(
    isPrepEligibleForCarryForward({ questionsSubmittedAt: null, questionsCarriedForwardAt: null, questions: oneQuestion }),
    false,
  )
  // Lead already submitted.
  assert.equal(
    isPrepEligibleForCarryForward({ questionsSubmittedAt: SUBMITTED_AT, questionsCarriedForwardAt: null, questions: [] }),
    false,
  )
  // Already carried.
  assert.equal(
    isPrepEligibleForCarryForward({ questionsSubmittedAt: null, questionsCarriedForwardAt: CARRIED_AT, questions: [] }),
    false,
  )
})

test('derivePreEvaluationStatus treats carried-forward questions as completed', () => {
  const base = {
    status: 'PENDING' as const,
    questionsSubmittedAt: null,
    evaluateesSubmittedAt: null,
    completedAt: null,
    overdueAt: null,
    overriddenAt: null,
    period: { reviewStartDate: new Date('2999-01-01T00:00:00.000Z') },
  }
  // Carried (not submitted) with a future review start still counts as done.
  assert.equal(
    derivePreEvaluationStatus({ ...base, questionsCarriedForwardAt: CARRIED_AT }),
    'COMPLETED',
  )
  // Untouched with a future review start is pending.
  assert.equal(
    derivePreEvaluationStatus({ ...base, questionsCarriedForwardAt: null }),
    'PENDING',
  )
  // Untouched past the review start is overdue.
  assert.equal(
    derivePreEvaluationStatus({
      ...base,
      questionsCarriedForwardAt: null,
      period: { reviewStartDate: new Date('2000-01-01T00:00:00.000Z') },
    }),
    'OVERDUE',
  )
})

test('deriveLeadRelationships builds direct report ownership from TEAM_LEAD rows only', () => {
  const derived = deriveLeadRelationships([
    {
      evaluatorId: 'lead-a',
      evaluateeId: 'report-a',
      relationshipType: 'TEAM_LEAD',
    },
    {
      evaluatorId: 'report-a',
      evaluateeId: 'lead-a',
      relationshipType: 'DIRECT_REPORT',
    },
    {
      evaluatorId: 'lead-b',
      evaluateeId: 'report-b',
      relationshipType: 'TEAM_LEAD',
    },
    {
      evaluatorId: 'peer-a',
      evaluateeId: 'peer-b',
      relationshipType: 'PEER',
    },
  ])

  assert.deepEqual(derived.leadIds, ['lead-a', 'lead-b'])
  assert.deepEqual(derived.directReportsByLead, {
    'lead-a': ['report-a'],
    'lead-b': ['report-b'],
  })
})

test('pre-evaluation question count is now two for team leads', () => {
  assert.equal(PRE_EVALUATION_QUESTION_COUNT, 2)
})

test('draft lead questions do not count as a submitted custom question set', () => {
  assert.equal(
    hasSubmittedLeadQuestionSet({
      questionsSubmittedAt: null,
      questions: [
        {
          id: 'q-1',
          prepId: 'prep-1',
          orderIndex: 1,
          questionText: 'Draft question',
          createdAt: new Date('2026-04-01T00:00:00.000Z'),
          updatedAt: new Date('2026-04-01T00:00:00.000Z'),
        },
      ],
    }),
    false
  )
})

test('question bank direction swaps team lead and direct report banks', () => {
  assert.equal(getDefaultQuestionBankRelationshipType('TEAM_LEAD'), 'DIRECT_REPORT')
  assert.equal(getDefaultQuestionBankRelationshipType('DIRECT_REPORT'), 'TEAM_LEAD')
  assert.equal(getDefaultQuestionBankRelationshipType('CROSS_DEPARTMENT'), 'TEAM_LEAD')
})

test('lead-authored KPI questions extend the direct report bank', () => {
  assert.equal(getLeadAuthoredQuestionBankRelationshipType(), 'DIRECT_REPORT')
})

test('runtime lead question count adds submitted lead questions on top of the default bank', () => {
  assert.equal(
    getRuntimeLeadQuestionCount({
      defaultQuestionCount: 3,
      leadQuestionCount: 2,
      includeLeadQuestions: true,
    }),
    5
  )

  assert.equal(
    getRuntimeLeadQuestionCount({
      defaultQuestionCount: 3,
      leadQuestionCount: 2,
      includeLeadQuestions: false,
    }),
    3
  )
})

test('runtime evaluation questions keep text prompts at the end after lead KPI questions are added', () => {
  const questions = buildRuntimeEvaluationQuestionSet({
    relationshipType: 'TEAM_LEAD',
    globalQuestions: [
      {
        id: 'global-1',
        questionText: 'Direct report default question 1',
        questionType: 'RATING',
        maxRating: 4,
        rating4Description: 'Transforms outcomes',
        rating3Description: 'Exceeds role goals',
        rating2Description: 'Meets role expectations',
        rating1Description: 'Below the required bar',
        orderIndex: 1,
      },
      {
        id: 'global-2',
        questionText: 'Direct report default question 2',
        questionType: 'TEXT',
        maxRating: 4,
        orderIndex: 2,
      },
    ],
    leadQuestions: [
      {
        id: 'lead-1',
        questionText: 'Lead add-on 1',
        rating4Description: 'Sets a new benchmark',
        rating3Description: 'Strong KPI delivery',
        rating2Description: 'Solid KPI delivery',
        rating1Description: 'Needs improvement on KPI',
        orderIndex: 1,
      },
      {
        id: 'lead-2',
        questionText: 'Lead add-on 2',
        orderIndex: 2,
      },
    ],
    leadSourceLeadId: 'lead-a',
    leadSourceLeadName: 'Lead A',
  })

  assert.deepEqual(
    questions.map((question) => ({
      id: question.id,
      sourceType: question.sourceType,
      questionType: question.questionType,
      orderIndex: question.orderIndex,
      sourceLeadName: question.sourceLeadName || null,
      rating4Description: question.ratingDescriptions?.[4] || '',
    })),
    [
      {
        id: 'global-1',
        sourceType: 'GLOBAL',
        questionType: 'RATING',
        orderIndex: 1,
        sourceLeadName: null,
        rating4Description: 'Transforms outcomes',
      },
      {
        id: 'lead-1',
        sourceType: 'LEAD',
        questionType: 'RATING',
        orderIndex: 2,
        sourceLeadName: 'Lead A',
        rating4Description: 'Sets a new benchmark',
      },
      {
        id: 'lead-2',
        sourceType: 'LEAD',
        questionType: 'RATING',
        orderIndex: 3,
        sourceLeadName: 'Lead A',
        rating4Description: '',
      },
      {
        id: 'global-2',
        sourceType: 'GLOBAL',
        questionType: 'TEXT',
        orderIndex: 4,
        sourceLeadName: null,
        rating4Description: '',
      },
    ]
  )
})

test('current quarter draft questions take precedence over previous submitted lead questions', () => {
  const resolved = resolvePrepQuestionPrefill({
    currentQuestions: [
      {
        id: 'current-1',
        prepId: 'prep-current',
        orderIndex: 1,
        questionText: 'Current draft question',
        createdAt: new Date('2026-04-01T00:00:00.000Z'),
        updatedAt: new Date('2026-04-01T00:00:00.000Z'),
      },
    ],
    currentQuestionsSubmittedAt: null,
    previousSubmission: {
      period: {
        id: 'period-prev',
        name: 'Q4 2025',
      },
      questionsSubmittedAt: new Date('2026-01-01T00:00:00.000Z'),
      questions: [
        {
          id: 'prev-1',
          prepId: 'prep-prev',
          orderIndex: 1,
          questionText: 'Previous question 1',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
    },
  })

  assert.deepEqual(resolved.questions.map((question) => question.id), ['current-1'])
  assert.equal(resolved.questionPrefillFrom, null)
})

test('empty current quarter prefill starts from the most recent submitted lead questions', () => {
  const resolved = resolvePrepQuestionPrefill({
    currentQuestions: [],
    currentQuestionsSubmittedAt: null,
    previousSubmission: {
      period: {
        id: 'period-prev',
        name: 'Q4 2025',
      },
      questionsSubmittedAt: new Date('2026-01-01T00:00:00.000Z'),
      questions: [
        {
          id: 'prev-2',
          prepId: 'prep-prev',
          orderIndex: 2,
          questionText: 'Previous question 2',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          id: 'prev-1',
          prepId: 'prep-prev',
          orderIndex: 1,
          questionText: 'Previous question 1',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
    },
  })

  assert.deepEqual(resolved.questions.map((question) => question.id), ['prev-1', 'prev-2'])
  assert.deepEqual(resolved.questionPrefillFrom, {
    periodId: 'period-prev',
    periodName: 'Q4 2025',
    submittedAt: new Date('2026-01-01T00:00:00.000Z'),
  })
})

test('derivePreEvaluationStatus completes once lead questions are submitted', () => {
  const status = derivePreEvaluationStatus({
    status: 'PENDING',
    questionsSubmittedAt: new Date('2026-04-01T00:00:00.000Z'),
    questionsCarriedForwardAt: null,
    evaluateesSubmittedAt: null,
    completedAt: null,
    overdueAt: null,
    overriddenAt: null,
    period: {
      reviewStartDate: new Date('2026-04-20T00:00:00.000Z'),
    },
  })

  assert.equal(status, 'COMPLETED')
})

test('validatePreEvaluationSelections allows change requests for self and direct reports', () => {
  const error = validatePreEvaluationSelections(
    [
      {
        type: 'PEER',
        evaluateeId: 'lead-a',
        suggestedEvaluatorId: 'peer-a',
      },
      {
        type: 'CROSS_DEPARTMENT',
        evaluateeId: 'report-a',
        suggestedEvaluatorId: 'peer-b',
      },
      {
        type: 'PRIMARY',
        evaluateeId: 'report-a',
      },
    ],
    {
      directReportIds: new Set(['report-a']),
      allowedEvaluateeIds: new Set(['lead-a', 'report-a']),
    }
  )

  assert.equal(error, null)
})

test('validatePreEvaluationSelections rejects change requests outside self or direct reports', () => {
  const error = validatePreEvaluationSelections(
    [
      {
        type: 'PEER',
        evaluateeId: 'employee-x',
        suggestedEvaluatorId: 'peer-a',
      },
    ],
    {
      directReportIds: new Set(['report-a']),
      allowedEvaluateeIds: new Set(['lead-a', 'report-a']),
    }
  )

  assert.equal(error, 'Evaluator change requests are only allowed for you or your direct reports')
})

test('isLeadTitle recognizes curated lead titles case-insensitively', () => {
  for (const title of PRE_EVALUATION_LEAD_TITLES) {
    assert.equal(isLeadTitle(title), true, `${title} should qualify`)
  }
  // Case- and whitespace-tolerant.
  assert.equal(isLeadTitle('  program delivery MANAGER '), true)
  assert.equal(isLeadTitle('team manager'), true)
  assert.equal(isLeadTitle('AM Team Lead'), true)
  // Non-lead / ambiguous titles do not qualify.
  assert.equal(isLeadTitle('Associate'), false)
  assert.equal(isLeadTitle('Senior Associate'), false)
  assert.equal(isLeadTitle('Senior Associate 2-Controller'), false)
  assert.equal(isLeadTitle('Customer Success Manager'), false)
  assert.equal(isLeadTitle('Account Manager'), false)
  assert.equal(isLeadTitle(null), false)
  assert.equal(isLeadTitle(''), false)
})

test('filterLeadsByTitle keeps only titled leads and preserves their reports', () => {
  const relationships = {
    leadIds: ['lead-titled', 'lead-accidental'],
    directReportsByLead: {
      'lead-titled': ['report-a', 'report-b'],
      'lead-accidental': ['report-c'],
    },
  }
  const positionById = {
    'lead-titled': 'Manager',
    'lead-accidental': 'Associate',
  }
  const filtered = filterLeadsByTitle(relationships, positionById)
  assert.deepEqual(filtered.leadIds, ['lead-titled'])
  assert.deepEqual(filtered.directReportsByLead, { 'lead-titled': ['report-a', 'report-b'] })
  // Immutability: original object is untouched.
  assert.deepEqual(relationships.leadIds, ['lead-titled', 'lead-accidental'])
  assert.deepEqual(relationships.directReportsByLead['lead-accidental'], ['report-c'])
})

test('filterLeadsByTitle treats a missing position as non-lead', () => {
  const filtered = filterLeadsByTitle(
    { leadIds: ['x'], directReportsByLead: { x: ['r'] } },
    {},
  )
  assert.deepEqual(filtered.leadIds, [])
  assert.deepEqual(filtered.directReportsByLead, {})
})

test('deriveLeadRelationships + filterLeadsByTitle drops accidental mapping leads', () => {
  const derived = deriveLeadRelationships([
    { evaluatorId: 'boss', evaluateeId: 'r1', relationshipType: 'TEAM_LEAD' },
    { evaluatorId: 'ic', evaluateeId: 'r2', relationshipType: 'TEAM_LEAD' },
  ])
  const filtered = filterLeadsByTitle(derived, { boss: 'Partner', ic: 'Associate' })
  assert.deepEqual(filtered.leadIds, ['boss'])
  assert.deepEqual(filtered.directReportsByLead, { boss: ['r1'] })
})
