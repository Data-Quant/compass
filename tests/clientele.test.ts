import test from 'node:test'
import assert from 'node:assert/strict'
import {
  hasClienteleAccess,
  canRequestRosterChange,
  canViewClient,
  validateRosterRequest,
  wouldLeaveClientUnmanaged,
  isVisibleClientStatus,
} from '../lib/clientele'

const managerOfA = [{ clientId: 'a', role: 'MANAGER' as const }]
const memberOfB = [{ clientId: 'b', role: 'MEMBER' as const }]
const both = [...managerOfA, ...memberOfB]

test('the section is hidden until someone is on a client', () => {
  assert.equal(hasClienteleAccess([]), false)
  assert.equal(hasClienteleAccess(memberOfB), true)
})

test('roles are per client, not per person', () => {
  // Leading one client must not confer leadership of another.
  assert.equal(canRequestRosterChange(both, 'a'), true)
  assert.equal(canRequestRosterChange(both, 'b'), false)
})

test('members can view their client but cannot request changes', () => {
  assert.equal(canViewClient(memberOfB, 'b'), true)
  assert.equal(canRequestRosterChange(memberOfB, 'b'), false)
})

test('nobody can view a client they are not assigned to', () => {
  assert.equal(canViewClient(managerOfA, 'b'), false)
  assert.equal(canRequestRosterChange(managerOfA, 'b'), false)
})

test('a request must ask for something specific', () => {
  const empty = validateRosterRequest({ items: [], currentMemberIds: [], requestedById: 'm' })
  assert.equal(empty.ok, false)
  assert.match(empty.ok === false ? empty.reason : '', /at least one/i)
})

test('a valid add and remove passes', () => {
  const result = validateRosterRequest({
    items: [
      { userId: 'new-person', action: 'ADD', role: 'MEMBER' },
      { userId: 'leaving', action: 'REMOVE' },
    ],
    currentMemberIds: ['leaving', 'm'],
    requestedById: 'm',
  })

  assert.equal(result.ok, true)
})

test('adding someone already on the roster is rejected', () => {
  // Signals a stale page rather than a real intent.
  const result = validateRosterRequest({
    items: [{ userId: 'already', action: 'ADD', role: 'MEMBER' }],
    currentMemberIds: ['already'],
    requestedById: 'm',
  })

  assert.equal(result.ok, false)
  assert.match(result.ok === false ? result.reason : '', /already on the roster/i)
})

test('removing someone who is not on the roster is rejected', () => {
  const result = validateRosterRequest({
    items: [{ userId: 'ghost', action: 'REMOVE' }],
    currentMemberIds: ['someone-else'],
    requestedById: 'm',
  })

  assert.equal(result.ok, false)
  assert.match(result.ok === false ? result.reason : '', /not on the roster/i)
})

test('a duplicate change in one request is rejected', () => {
  const result = validateRosterRequest({
    items: [
      { userId: 'x', action: 'ADD', role: 'MEMBER' },
      { userId: 'x', action: 'ADD', role: 'MANAGER' },
    ],
    currentMemberIds: [],
    requestedById: 'm',
  })

  assert.equal(result.ok, false)
  assert.match(result.ok === false ? result.reason : '', /twice/i)
})

test('a manager cannot request their own removal', () => {
  // They would lose the page they need to follow it up on, and the client could
  // be left with nobody able to request anything.
  const result = validateRosterRequest({
    items: [{ userId: 'm', action: 'REMOVE' }],
    currentMemberIds: ['m'],
    requestedById: 'm',
  })

  assert.equal(result.ok, false)
})

test('HR is warned before a client is left with no manager', () => {
  const roster = [
    { userId: 'only-manager', role: 'MANAGER' as const },
    { userId: 'a-member', role: 'MEMBER' as const },
  ]

  assert.equal(wouldLeaveClientUnmanaged(roster, 'only-manager'), true)
  assert.equal(wouldLeaveClientUnmanaged(roster, 'a-member'), false)
})

test('removing one of several managers is fine', () => {
  const roster = [
    { userId: 'manager-1', role: 'MANAGER' as const },
    { userId: 'manager-2', role: 'MANAGER' as const },
  ]

  assert.equal(wouldLeaveClientUnmanaged(roster, 'manager-1'), false)
})

test('inactive clients drop off the member view but stay on record', () => {
  assert.equal(isVisibleClientStatus('ACTIVE'), true)
  assert.equal(isVisibleClientStatus('INACTIVE'), false)
})
