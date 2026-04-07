import test from 'node:test'
import assert from 'node:assert/strict'
import { toCategorySetKey } from '../types'
import {
  analyzeWeightProfileAssignments,
  buildWorkbookProfileDefinition,
  extractWorkbookProfileMembers,
  parseCsvCategorySet,
  STANDARD_WEIGHT_PROFILES,
  toSeededWeightProfiles,
} from '../lib/weight-profiles'

test('standard workbook weight profile seed includes all 9 supported profiles', () => {
  assert.equal(STANDARD_WEIGHT_PROFILES.length, 9)

  const profile = STANDARD_WEIGHT_PROFILES.find(
    (entry) => entry.displayName === 'Peer, HR, C-Level (Hamiz), Dept'
  )

  assert.ok(profile, 'Expected Peer, HR, C-Level (Hamiz), Dept profile to exist')
  assert.deepEqual(
    Object.keys(profile!.weights).sort(),
    ['C_LEVEL', 'DEPT', 'HR', 'PEER']
  )

  const sum = Object.values(profile!.weights).reduce((total, value) => total + value, 0)
  assert.ok(Math.abs(sum - 1) < 0.000001, `Expected weights to sum to 1, got ${sum}`)
})

test('parseCsvCategorySet maps workbook-style labels into relationship types', () => {
  const types = parseCsvCategorySet('Peer, HR, Hamiz, Dept')
  assert.equal(toCategorySetKey(types), 'C_LEVEL,DEPT,HR,PEER')
})

test('toSeededWeightProfiles builds canonical category keys for workbook profiles', () => {
  const seeded = toSeededWeightProfiles()
  assert.equal(seeded.length, 9)
  assert.ok(
    seeded.some((profile) => profile.categorySetKey === 'C_LEVEL,DEPT,HR,PEER,TEAM_LEAD')
  )
})

test('extractWorkbookProfileMembers matches concatenated member blobs against known names', () => {
  const members = extractWorkbookProfileMembers('AmalMajjoutArsalaKhanNohaHamraoui', [
    'Arsala Khan',
    'Amal Majjout',
    'Noha Hamraoui',
    'Random Person',
  ])

  assert.deepEqual(members, ['Amal Majjout', 'Arsala Khan', 'Noha Hamraoui'])
})

test('buildWorkbookProfileDefinition derives the expected category set and members', () => {
  const profile = buildWorkbookProfileDefinition({
    profileName: 'Profile 4',
    weightRows: [
      { relationshipType: 'DEPT', weight: 0.2 },
      { relationshipType: 'TEAM_LEAD', weight: 0.25 },
      { relationshipType: 'C_LEVEL', weight: 0.3 },
      { relationshipType: 'PEER', weight: 0.15 },
      { relationshipType: 'HR', weight: 0.1 },
    ],
    memberBlob: 'AmalMajjoutArsalaKhan',
    candidateNames: ['Amal Majjout', 'Arsala Khan', 'Noha Hamraoui'],
  })

  assert.equal(profile.categorySetKey, 'C_LEVEL,DEPT,HR,PEER,TEAM_LEAD')
  assert.deepEqual(profile.expectedMembers, ['Amal Majjout', 'Arsala Khan'])
})

test('analyzeWeightProfileAssignments flags users whose mappings miss saved constant-backed profiles', () => {
  const diagnostics = analyzeWeightProfileAssignments({
    profiles: [
      {
        categorySetKey: 'DEPT,HR,TEAM_LEAD',
        displayName: 'Team Lead, HR, Dept',
        weights: { TEAM_LEAD: 0.45, HR: 0.1, DEPT: 0.45 },
      },
    ],
    users: [
      { id: 'user-1', name: 'Amal Majjout', department: 'Operating Partner-Value Creation' },
    ],
    mappings: [
      { evaluateeId: 'user-1', relationshipType: 'TEAM_LEAD' },
    ],
  })

  assert.equal(diagnostics.unmatchedCategorySets.length, 1)
  assert.equal(diagnostics.unmatchedCategorySets[0].categorySetKey, 'TEAM_LEAD')
  assert.deepEqual(diagnostics.unmatchedCategorySets[0].likelyMissingConstantTypes, ['HR', 'DEPT'])
})
