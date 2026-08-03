import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canEditAssignedProjectTask,
  resolveProjectCapabilities,
} from '../lib/project-access'

const members = [
  { userId: 'member', role: 'MEMBER' },
  { userId: 'lead', role: 'LEAD' },
  { userId: 'membership-owner', role: 'OWNER' },
]

test('HR can access and manage every project', () => {
  assert.deepEqual(resolveProjectCapabilities({
    viewer: { id: 'hr', role: 'HR' },
    ownerId: 'owner',
    members,
  }), { canAccess: true, canManage: true, isParticipant: false, membershipRole: null })
})

test('project owner and OWNER or LEAD memberships can manage', () => {
  for (const viewerId of ['owner', 'lead', 'membership-owner']) {
    const capability = resolveProjectCapabilities({
      viewer: { id: viewerId, role: 'EMPLOYEE' },
      ownerId: 'owner',
      members,
    })
    assert.equal(capability.canAccess, true)
    assert.equal(capability.canManage, true)
  }
})

test('normal members can access but cannot manage', () => {
  assert.deepEqual(resolveProjectCapabilities({
    viewer: { id: 'member', role: 'EMPLOYEE' },
    ownerId: 'owner',
    members,
  }), { canAccess: true, canManage: false, isParticipant: true, membershipRole: 'MEMBER' })
})

test('unrelated users cannot access a project', () => {
  assert.deepEqual(resolveProjectCapabilities({
    viewer: { id: 'outsider', role: 'EMPLOYEE' },
    ownerId: 'owner',
    members,
  }), { canAccess: false, canManage: false, isParticipant: false, membershipRole: null })
})

test('backlog participation is limited to the project owner and explicit members for every role', () => {
  assert.equal(resolveProjectCapabilities({ viewer: { id: 'owner', role: 'EMPLOYEE' }, ownerId: 'owner', members }).isParticipant, true)
  assert.equal(resolveProjectCapabilities({ viewer: { id: 'member', role: 'EMPLOYEE' }, ownerId: 'owner', members }).isParticipant, true)
  assert.equal(resolveProjectCapabilities({ viewer: { id: 'hr-not-on-project', role: 'HR' }, ownerId: 'owner', members }).isParticipant, false)
})

test('members may edit only their assigned tasks while managers may edit any task', () => {
  assert.equal(canEditAssignedProjectTask({
    viewerId: 'member-1',
    assigneeId: 'member-1',
    canManage: false,
  }), true)
  assert.equal(canEditAssignedProjectTask({
    viewerId: 'member-1',
    assigneeId: 'member-2',
    assistantIds: ['member-1'],
    canManage: false,
  }), true)
  assert.equal(canEditAssignedProjectTask({
    viewerId: 'member-1',
    assigneeId: 'member-2',
    assistantIds: ['member-3'],
    canManage: false,
  }), false)
  assert.equal(canEditAssignedProjectTask({
    viewerId: 'lead-1',
    assigneeId: null,
    canManage: true,
  }), true)
})
