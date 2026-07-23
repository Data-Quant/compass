import test from 'node:test'
import assert from 'node:assert/strict'
import {
  shouldReceiveConstantEvaluations,
  shouldReceiveReportForPeriod,
  getMappingConstraint,
} from '../lib/evaluation-profile-rules'
import {
  isExcludedMappingUser,
  shouldSkipMappingParticipants,
  getPhysicalMappingsForLogicalRelationship,
} from '../lib/evaluation-mappings'

// 3E team members can now be given a TEAM_LEAD mapping so leave approval routes to
// their lead (see app/api/admin/leave-approvers/route.ts). Those rows must stay
// invisible to evaluations, the org-wide mapping screens and the org chart. These
// tests pin the invariants that keep that true, since the rows themselves no longer
// prove it by their absence.

const threeEMember = { id: 'u1', name: 'Team Member', department: '3E', position: 'Analyst' }
const threeEMemberSpaced = { id: 'u2', name: 'Other Member', department: ' 3e ', position: 'Analyst' }
const plutusMember = { id: 'u3', name: 'Plutus Person', department: 'Engineering', position: 'Engineer' }

test('3E members never receive evaluations, whatever mappings exist', () => {
  assert.equal(shouldReceiveConstantEvaluations(threeEMember), false)
  assert.equal(shouldReceiveConstantEvaluations(threeEMemberSpaced), false)
  assert.equal(shouldReceiveConstantEvaluations(plutusMember), true)
})

test('3E members never receive a report, even with assignments present', () => {
  const assignments = [{ evaluateeId: threeEMember.id }, { evaluateeId: plutusMember.id }]

  assert.equal(shouldReceiveReportForPeriod(threeEMember, assignments), false)
  assert.equal(shouldReceiveReportForPeriod(plutusMember, assignments), true)
})

test('3E stays excluded from the org-wide mapping screens and org chart', () => {
  assert.equal(isExcludedMappingUser(threeEMember), true)
  assert.equal(isExcludedMappingUser(threeEMemberSpaced), true)
  assert.equal(isExcludedMappingUser(plutusMember), false)

  // Either participant being 3E removes the row from the org-wide list.
  assert.equal(shouldSkipMappingParticipants([plutusMember, threeEMember]), true)
  assert.equal(shouldSkipMappingParticipants([threeEMember, plutusMember]), true)
  assert.equal(shouldSkipMappingParticipants([plutusMember, plutusMember]), false)
})

test('the org-wide mapping route still refuses 3E team leads', () => {
  const usersById = new Map([
    [threeEMember.id, threeEMember],
    [plutusMember.id, plutusMember],
  ])

  // The dedicated 3E endpoint is the only way in; the shared constraint is unchanged.
  const constraint = getMappingConstraint(
    { evaluatorId: plutusMember.id, evaluateeId: threeEMember.id, relationshipType: 'TEAM_LEAD' },
    usersById
  )

  assert.equal(constraint.blocked, true)
})

test('a 3E team lead assignment writes one TEAM_LEAD row and no evaluation mirror', () => {
  const rows = getPhysicalMappingsForLogicalRelationship(
    { evaluatorId: plutusMember.id, evaluateeId: threeEMember.id, relationshipType: 'TEAM_LEAD' },
    { skipManagementMirror: true }
  )

  assert.equal(rows.length, 1)
  assert.equal(rows[0].relationshipType, 'TEAM_LEAD')
  assert.equal(rows[0].evaluatorId, plutusMember.id)
  assert.equal(rows[0].evaluateeId, threeEMember.id)

  // Without the flag a DIRECT_REPORT mirror appears, which would make the 3E member
  // evaluate their lead. The endpoint always passes skipManagementMirror.
  const mirrored = getPhysicalMappingsForLogicalRelationship(
    { evaluatorId: plutusMember.id, evaluateeId: threeEMember.id, relationshipType: 'TEAM_LEAD' },
    {}
  )

  assert.equal(mirrored.length, 2)
  assert.ok(mirrored.some((row) => row.relationshipType === 'DIRECT_REPORT'))
})
