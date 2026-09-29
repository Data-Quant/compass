import test from 'node:test'
import assert from 'node:assert/strict'
import { buildKpiScope, departmentKeyOf, isInScheme, type ScopeUser } from '../lib/kpi/scope'

const user = (id: string, position: string | null, department: string | null, extra: Partial<ScopeUser> = {}): ScopeUser => ({
  id, name: id.toUpperCase(), position, department, payrollActive: true, exitDate: null, ...extra,
})
const tl = (evaluatorId: string, evaluateeId: string) => ({ evaluatorId, evaluateeId, relationshipType: 'TEAM_LEAD' })

const users: ScopeUser[] = [
  user('lead', 'Lead', 'Product'),
  user('mgr', 'Manager', 'Product'),
  user('jp', 'Junior Partner', 'Value Creation'),
  user('partner', 'Partner', 'Executive'),
  user('senior', 'Senior Associate', 'Design'),
  user('a', 'Analyst', 'Product'),
  user('b', 'Analyst', 'Product'),
  user('c', 'Analyst', 'Design'),
  user('e', 'SDR', '3E'),
  user('hamiz', 'CEO', 'Executive', { name: 'Hamiz Awan' }),
  user('gone', 'Analyst', 'Product', { payrollActive: false }),
]
const mappings = [
  tl('lead', 'a'), tl('lead', 'b'), tl('mgr', 'b'), tl('senior', 'c'), tl('lead', 'e'), tl('partner', 'lead'),
  { evaluatorId: 'a', evaluateeId: 'b', relationshipType: 'PEER' },
]

test('scheme excludes 3E, named leaders, exact Partners and inactive people', () => {
  const scope = buildKpiScope(users, mappings, [])
  assert.deepEqual([...scope.inScheme].sort(), ['a', 'b', 'c', 'jp', 'lead', 'mgr', 'senior'])
  assert.equal(isInScheme(user('x', 'Analyst', ' 3e ')), false)
})

test('lead and JP titles are measured on department KPIs, grouped by department key', () => {
  const scope = buildKpiScope(users, mappings, [])
  assert.deepEqual([...scope.leadIds].sort(), ['jp', 'lead', 'mgr'])
  assert.deepEqual(scope.departmentOwners.get('product'), ['lead', 'mgr'])
  assert.deepEqual(scope.departmentOwners.get('value creation'), ['jp'])
  assert.equal(scope.setterIdsByEmployee.has('lead'), false)
})

test('team members get every title-qualified TEAM_LEAD as a setter', () => {
  const scope = buildKpiScope(users, mappings, [])
  assert.deepEqual(scope.setterIdsByEmployee.get('a'), ['lead'])
  assert.deepEqual(scope.setterIdsByEmployee.get('b'), ['lead', 'mgr'])
  assert.deepEqual(scope.teamBySetter.get('lead'), ['a', 'b'])
  assert.deepEqual(scope.teamBySetter.get('mgr'), ['b'])
  assert.deepEqual(scope.membersWithoutSetter, ['c', 'senior'])
})

test('HR setter assignments replace the default, and invalid rows are ignored', () => {
  const scope = buildKpiScope(users, mappings, [
    { employeeId: 'c', setterId: 'partner' },
    { employeeId: 'b', setterId: 'jp' },
    { employeeId: 'senior', setterId: 'senior' },
    { employeeId: 'senior', setterId: 'nobody' },
  ])
  assert.deepEqual(scope.setterIdsByEmployee.get('c'), ['partner'])
  assert.deepEqual(scope.setterIdsByEmployee.get('b'), ['jp'])
  assert.deepEqual(scope.teamBySetter.get('lead'), ['a'])
  assert.deepEqual(scope.membersWithoutSetter, ['senior'])
})

test('department keys trim and lowercase, but do not merge different spellings', () => {
  assert.equal(departmentKeyOf('Noble '), departmentKeyOf('noble'))
  assert.notEqual(departmentKeyOf('1to1 Plans'), departmentKeyOf('1to1Plans'))
  const scope = buildKpiScope(
    [user('l1', 'Lead', '1to1 Plans'), user('l2', 'Lead', '1to1Plans'), user('l3', 'Lead', 'Noble '), user('l4', 'Manager', 'noble')],
    [],
    [],
  )
  assert.deepEqual([...scope.departmentOwners.keys()].sort(), ['1to1 plans', '1to1plans', 'noble'])
  assert.deepEqual(scope.departmentOwners.get('noble'), ['l3', 'l4'])
})
