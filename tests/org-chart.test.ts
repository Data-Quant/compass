import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildFocusedOrgChartScene,
  buildHierarchyOrgChartScene,
  buildOrgChartMeta,
  buildOverviewOrgChartScene,
  type OrgChartMapping,
  type OrgChartUser,
} from '../lib/org-chart'

const users: OrgChartUser[] = [
  {
    id: 'hamiz',
    name: 'Hamiz Awan',
    department: 'Executive',
    position: 'Partner',
    role: 'EMPLOYEE',
    chartX: null,
    chartY: null,
  },
  {
    id: 'brad',
    name: 'Brad Herman',
    department: 'Operating Partner-Value Creation',
    position: 'Partner',
    role: 'EMPLOYEE',
    chartX: null,
    chartY: null,
  },
  {
    id: 'areebah',
    name: 'Areebah Akhlaque',
    department: 'Human Resources',
    position: 'Principal and Junior Partner',
    role: 'HR',
    chartX: null,
    chartY: null,
  },
  {
    id: 'saman',
    name: 'Saman Fahim',
    department: 'Human Resources',
    position: 'Senior Associate',
    role: 'HR',
    chartX: null,
    chartY: null,
  },
  {
    id: 'noha',
    name: 'Noha Hamraoui',
    department: 'Operating Partner-Execution',
    position: 'Partner',
    role: 'EMPLOYEE',
    chartX: null,
    chartY: null,
  },
]

const mappings: OrgChartMapping[] = [
  {
    id: 'lead-brad-areebah',
    evaluatorId: 'brad',
    evaluateeId: 'areebah',
    relationshipType: 'TEAM_LEAD',
    evaluator: users[1],
    evaluatee: users[2],
  },
  {
    id: 'c-level-hamiz-areebah',
    evaluatorId: 'hamiz',
    evaluateeId: 'areebah',
    relationshipType: 'C_LEVEL',
    evaluator: users[0],
    evaluatee: users[2],
  },
  {
    id: 'lead-areebah-saman',
    evaluatorId: 'areebah',
    evaluateeId: 'saman',
    relationshipType: 'TEAM_LEAD',
    evaluator: users[2],
    evaluatee: users[3],
  },
  {
    id: 'lead-noha-saman',
    evaluatorId: 'noha',
    evaluateeId: 'saman',
    relationshipType: 'TEAM_LEAD',
    evaluator: users[4],
    evaluatee: users[3],
  },
  {
    id: 'peer-areebah-noha',
    evaluatorId: 'areebah',
    evaluateeId: 'noha',
    relationshipType: 'PEER',
    evaluator: users[2],
    evaluatee: users[4],
  },
]

test('buildOrgChartMeta derives top-level leaders from TEAM_LEAD only', () => {
  const meta = buildOrgChartMeta(users, mappings)

  assert.deepEqual(meta.topLevelLeaderIds, ['brad', 'hamiz', 'noha'])
  assert.deepEqual(meta.isolatedUserIds, [])
  assert.equal(meta.relationshipCounts.TEAM_LEAD, 3)
  assert.equal(meta.relationshipCounts.C_LEVEL, 1)
})

test('buildFocusedOrgChartScene keeps multiple team leads visible for one employee', () => {
  const scene = buildFocusedOrgChartScene(users, mappings, {
    selectedUserId: 'saman',
    relationshipFilter: 'all',
  })

  assert.equal(scene.nodes.length, 3)
  assert.equal(scene.edges.filter((edge) => edge.relationshipType === 'TEAM_LEAD').length, 2)
  assert.equal(scene.visibleUserIds.includes('areebah'), true)
  assert.equal(scene.visibleUserIds.includes('noha'), true)
})

test('buildOverviewOrgChartScene isolates a selected neighborhood without losing its edges', () => {
  const scene = buildOverviewOrgChartScene(users, mappings, {
    isolateUserId: 'areebah',
  })

  assert.deepEqual(
    new Set(scene.visibleUserIds),
    new Set(['areebah', 'brad', 'hamiz', 'saman', 'noha'])
  )
  assert.equal(scene.edges.length, 5)
})

test('buildHierarchyOrgChartScene ignores C_LEVEL hierarchy edges and adds company edges for top-level leaders', () => {
  const scene = buildHierarchyOrgChartScene(users, mappings)

  assert.equal(scene.edges.some((edge) => edge.relationshipType === 'C_LEVEL'), false)
  assert.equal(
    scene.edges.filter((edge) => edge.synthetic && edge.source === 'company').length,
    3
  )
  assert.equal(scene.nodes.some((node) => node.id === 'company'), true)
})
