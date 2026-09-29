import test from 'node:test'
import assert from 'node:assert/strict'
import { buildKpiScope, type ScopeUser } from '../lib/kpi/scope'
import {
  canClaim, canDecideChange, canEditGoal, canManageTeamGoalsFor, canRequestChange, canVerify, canViewDepartment,
  canViewKpi, isDepartmentSetter, isTeamSetter, isVerifierEligible, ownerError, type KpiActor, type KpiRef,
} from '../lib/kpi/permissions'
import type { AppUserRole } from '../lib/permissions'
import type { KpiGrantRoleValue } from '../lib/kpi/view-types'

const person = (id: string, position: string, department: string): ScopeUser => ({
  id, name: id, position, department, payrollActive: true, exitDate: null,
})
const scope = buildKpiScope(
  [
    person('lead', 'Lead', 'Product'), person('jp', 'Junior Partner', 'Product'), person('exec', 'Junior Partner', 'Value Creation'),
    person('verifier', 'Analyst', 'Value Creation'), person('member', 'Analyst', 'Product'), person('other', 'Analyst', 'Design'),
    person('partner', 'Partner', 'Executive'), person('hr', 'HR Executive', 'Human Resources'),
  ],
  [{ evaluatorId: 'lead', evaluateeId: 'member', relationshipType: 'TEAM_LEAD' }],
  [],
)
const actor = (id: string, role: AppUserRole = 'EMPLOYEE', position = 'Analyst', departmentKey = 'product', grants: KpiGrantRoleValue[] = []): KpiActor =>
  ({ id, role, position, departmentKey, grants })

const lead = actor('lead', 'EMPLOYEE', 'Lead')
const jp = actor('jp', 'EMPLOYEE', 'Junior Partner')
const partner = actor('partner', 'EMPLOYEE', 'Partner', 'executive')
const hr = actor('hr', 'HR', 'HR Executive', 'human resources')
const exec = actor('exec', 'EXECUTION', 'Junior Partner', 'value creation')
const verifier = actor('verifier', 'EMPLOYEE', 'Analyst', 'value creation', ['VERIFIER'])
const member = actor('member')
const other = actor('other', 'EMPLOYEE', 'Analyst', 'design')

const teamKpi: KpiRef = { scope: 'TEAM', setterId: 'lead', departmentKey: null, assigneeIds: ['member'], claimedById: null }
const vcKpi: KpiRef = { scope: 'DEPARTMENT', setterId: 'partner', departmentKey: 'value creation', assigneeIds: ['exec'], claimedById: null }

test('department setters are HR, Partner or Managing Partner titles, or a grant', () => {
  assert.equal(isDepartmentSetter(hr), true)
  assert.equal(isDepartmentSetter(partner), true)
  assert.equal(isDepartmentSetter(actor('mp', 'EMPLOYEE', ' Managing  Partner ')), true)
  assert.equal(isDepartmentSetter(jp), false)
  assert.equal(isDepartmentSetter(actor('x', 'EMPLOYEE', 'Analyst', 'product', ['DEPARTMENT_SETTER'])), true)
})

test('verifiers are EXECUTION, HR or granted', () => {
  assert.equal(isVerifierEligible(exec), true)
  assert.equal(isVerifierEligible(hr), true)
  assert.equal(isVerifierEligible(verifier), true)
  assert.equal(isVerifierEligible(member), false)
})

test('team goals are created by the setter or by HR on their behalf', () => {
  assert.equal(isTeamSetter(lead, scope), true)
  assert.equal(isTeamSetter(member, scope), false)
  assert.equal(canManageTeamGoalsFor(lead, 'lead', scope), true)
  assert.equal(canManageTeamGoalsFor(member, 'lead', scope), false)
  assert.equal(canManageTeamGoalsFor(hr, 'lead', scope), true)
  assert.equal(canManageTeamGoalsFor(hr, 'member', scope), false)
})

test('goal editing follows scope', () => {
  const teamGoal = { scope: 'TEAM' as const, setterId: 'lead', departmentKey: null }
  const deptGoal = { scope: 'DEPARTMENT' as const, setterId: 'partner', departmentKey: 'product' }
  assert.equal(canEditGoal(lead, teamGoal), true)
  assert.equal(canEditGoal(jp, teamGoal), false)
  assert.equal(canEditGoal(hr, teamGoal), true)
  assert.equal(canEditGoal(partner, deptGoal), true)
  assert.equal(canEditGoal(jp, deptGoal), false)
})

test('owners must be in the team or be the department leads/JPs', () => {
  const teamGoal = { scope: 'TEAM' as const, setterId: 'lead', departmentKey: null }
  const deptGoal = { scope: 'DEPARTMENT' as const, setterId: 'partner', departmentKey: 'product' }
  assert.equal(ownerError(teamGoal, ['member'], scope), null)
  assert.match(ownerError(teamGoal, ['other'], scope) ?? '', /team/)
  assert.match(ownerError(teamGoal, [], scope) ?? '', /at least one owner/)
  assert.match(ownerError(teamGoal, ['member', 'member'], scope) ?? '', /unique/)
  assert.equal(ownerError(deptGoal, ['lead', 'jp'], scope), null)
  assert.match(ownerError(deptGoal, ['member'], scope) ?? '', /leads or JPs/)
})

test('department visibility', () => {
  assert.equal(canViewDepartment(jp, 'product', scope), true)
  assert.equal(canViewDepartment(jp, 'value creation', scope), false)
  assert.equal(canViewDepartment(partner, 'value creation', scope), true)
  assert.equal(canViewDepartment(member, 'product', scope), false)
})

test('KPI visibility', () => {
  assert.equal(canViewKpi(member, teamKpi, scope), true)
  assert.equal(canViewKpi(lead, teamKpi, scope), true)
  assert.equal(canViewKpi(other, teamKpi, scope), false)
  assert.equal(canViewKpi(verifier, teamKpi, scope), true)
  assert.equal(canViewKpi(exec, vcKpi, scope), true)
  assert.equal(canViewKpi(jp, vcKpi, scope), false)
})

test('claimers: team KPIs by the setter, department KPIs by an owner, HR always', () => {
  assert.equal(canClaim(lead, teamKpi), true)
  assert.equal(canClaim(member, teamKpi), false)
  assert.equal(canClaim(exec, vcKpi), true)
  assert.equal(canClaim(partner, vcKpi), false)
  assert.equal(canClaim(hr, vcKpi), true)
})

test('conflict rule: the Execution JP cannot verify her own department KPI; a granted verifier and HR can', () => {
  assert.equal(canVerify(exec, vcKpi), false)
  assert.equal(canVerify(verifier, vcKpi), true)
  assert.equal(canVerify(hr, vcKpi), true)
  assert.equal(canVerify(member, teamKpi), false)
  assert.equal(canVerify(verifier, { ...teamKpi, claimedById: 'verifier' }), false)
  assert.equal(canVerify(actor('lead', 'HR'), teamKpi), false)
})

test('change requests and their decisions', () => {
  assert.equal(canRequestChange(lead, teamKpi), true)
  assert.equal(canRequestChange(partner, vcKpi), true)
  assert.equal(canRequestChange(other, teamKpi), false)
  assert.equal(canDecideChange(verifier, teamKpi, 'lead'), true)
  assert.equal(canDecideChange(verifier, teamKpi, 'verifier'), false)
  assert.equal(canDecideChange(exec, vcKpi, 'partner'), false)
})
