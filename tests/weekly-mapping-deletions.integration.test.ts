import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { HAMIZ_EVALUATOR } from '../lib/config'
import { prisma } from '../lib/db'
import { clearAutomaticMappingDeletion, recordAutomaticMappingDeletion, syncConstantEvaluatorMappingsForUsers } from '../lib/evaluation-constants'
import { resetWeeklyTestData, seedWeeklyBase, W, WEEKLY_DB_READY, WEEKLY_DB_TEST } from './helpers/weekly-test-db'

// The fictional stand-in for the named department evaluator the automation adds to everyone evaluated.
const HAMIZ = { id: 'wkt-dept-evaluator', name: HAMIZ_EVALUATOR, role: 'EMPLOYEE' as const, position: 'Chief Executive', department: 'Leadership' }

beforeEach(async () => {
  if (!WEEKLY_DB_READY) return
  await resetWeeklyTestData(prisma)
  await seedWeeklyBase(prisma)
  await prisma.user.create({ data: { ...HAMIZ, email: `${HAMIZ.id}@example.test`, onboardingCompleted: true } })
})
after(async () => {
  await prisma.$disconnect()
})

const deptMapping = (evaluateeId: string) => ({ evaluatorId: HAMIZ.id, evaluateeId, relationshipType: 'DEPT' as const })
const hasDept = async (evaluateeId: string) => (await prisma.evaluatorMapping.count({ where: deptMapping(evaluateeId) })) > 0

test('a department evaluation HR deletes stays deleted; everyone else keeps theirs; adding it back makes it automatic again', WEEKLY_DB_TEST, async () => {
  await syncConstantEvaluatorMappingsForUsers(prisma, [W.ana.id, W.ben.id])
  assert.deepEqual([await hasDept(W.ana.id), await hasDept(W.ben.id)], [true, true], 'the automation adds it for everyone evaluated')

  // HR deletes Ana's, as the mappings page does: the mapping goes, the deletion is remembered, then the sync runs.
  await prisma.evaluatorMapping.deleteMany({ where: deptMapping(W.ana.id) })
  await recordAutomaticMappingDeletion(prisma, deptMapping(W.ana.id), W.hr.id)
  await syncConstantEvaluatorMappingsForUsers(prisma, [W.ana.id, W.ben.id])
  assert.deepEqual([await hasDept(W.ana.id), await hasDept(W.ben.id)], [false, true], 'it stays deleted for Ana only')

  // HR adds it back by hand: automatic again, so later syncs keep it.
  await prisma.evaluatorMapping.create({ data: deptMapping(W.ana.id) })
  await clearAutomaticMappingDeletion(prisma, deptMapping(W.ana.id))
  await prisma.evaluatorMapping.deleteMany({ where: deptMapping(W.ana.id) })
  await syncConstantEvaluatorMappingsForUsers(prisma, [W.ana.id])
  assert.equal(await hasDept(W.ana.id), true)
})

test('only automatic mappings are remembered: deleting a lead or peer mapping records nothing', WEEKLY_DB_TEST, async () => {
  await recordAutomaticMappingDeletion(prisma, { evaluatorId: W.lead.id, evaluateeId: W.ana.id, relationshipType: 'TEAM_LEAD' }, W.hr.id)
  await recordAutomaticMappingDeletion(prisma, { evaluatorId: W.ben.id, evaluateeId: W.ana.id, relationshipType: 'PEER' }, W.hr.id)
  assert.equal(await prisma.evaluatorMappingExclusion.count({ where: { evaluateeId: W.ana.id } }), 0)
})
