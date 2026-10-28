import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

export type ProjectViewer = {
  id: string
  role: string | null | undefined
}

export type ProjectMembershipForAccess = {
  userId: string
  role: string
}

export type ProjectAuthorization = {
  exists: boolean
  canAccess: boolean
  canManage: boolean
  isParticipant: boolean
  ownerId: string | null
  membershipRole: string | null
}

const MANAGER_MEMBERSHIP_ROLES = new Set(['OWNER', 'LEAD'])

export function resolveProjectCapabilities(input: {
  viewer: ProjectViewer
  ownerId: string
  members: ProjectMembershipForAccess[]
}) {
  const membership = input.members.find((member) => member.userId === input.viewer.id) || null
  const isHr = input.viewer.role === 'HR'
  const isOwner = input.ownerId === input.viewer.id
  const isParticipant = isOwner || Boolean(membership)
  const isMembershipManager = Boolean(
    membership && MANAGER_MEMBERSHIP_ROLES.has(membership.role.trim().toUpperCase())
  )

  return {
    canAccess: isHr || isParticipant,
    canManage: isHr || isOwner || isMembershipManager,
    isParticipant,
    membershipRole: membership?.role || null,
  }
}

export function canEditAssignedProjectTask(input: {
  viewerId: string
  assigneeId: string | null
  assistantIds?: string[]
  canManage: boolean
}) {
  return input.canManage
    || input.assigneeId === input.viewerId
    || Boolean(input.assistantIds?.includes(input.viewerId))
}

const ASSIGNMENT_UPDATE_KEYS = new Set(['taskId', 'assigneeId', 'assistantIds'])

// A PUT that only changes the assignee or co-assignees, which any project member may do.
export function isAssignmentOnlyTaskUpdate(body: unknown) {
  return typeof body === 'object' && body !== null && !Array.isArray(body)
    && Object.keys(body).every((key) => ASSIGNMENT_UPDATE_KEYS.has(key))
}

export function accessibleProjectsWhere(viewer: ProjectViewer): Prisma.ProjectWhereInput {
  if (viewer.role === 'HR') return {}

  return {
    OR: [
      { ownerId: viewer.id },
      { members: { some: { userId: viewer.id } } },
    ],
  }
}

export async function getProjectAuthorization(
  projectId: string,
  viewer: ProjectViewer
): Promise<ProjectAuthorization> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      ownerId: true,
      members: { select: { userId: true, role: true } },
    },
  })

  if (!project) {
    return {
      exists: false,
      canAccess: false,
      canManage: false,
      isParticipant: false,
      ownerId: null,
      membershipRole: null,
    }
  }

  const capabilities = resolveProjectCapabilities({
    viewer,
    ownerId: project.ownerId,
    members: project.members,
  })

  return {
    exists: true,
    ownerId: project.ownerId,
    ...capabilities,
  }
}

export function projectAuthorizationFailure(
  authorization: ProjectAuthorization,
  capability: 'access' | 'manage' = 'access'
) {
  if (!authorization.exists) return { status: 404, error: 'Project not found' }
  if (capability === 'manage' ? !authorization.canManage : !authorization.canAccess) {
    return { status: 403, error: 'Forbidden' }
  }
  return null
}

// Prisma ids are cuids; the bounded pattern rejects anything else before it reaches a query.
export function isProjectRecordId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9]{20,40}$/i.test(value)
}

export function filterManageableProjects<T extends { ownerId: string; members: ProjectMembershipForAccess[] }>(
  viewer: ProjectViewer,
  projects: T[],
) {
  return projects.filter((project) => resolveProjectCapabilities({
    viewer,
    ownerId: project.ownerId,
    members: project.members,
  }).canManage)
}

// Roles a manager may assign; OWNER is set only when the project is created.
export const ASSIGNABLE_MEMBER_ROLES = ['MEMBER', 'LEAD'] as const
export type AssignableMemberRole = (typeof ASSIGNABLE_MEMBER_ROLES)[number]

export function parseMemberRoleInput(body: unknown): { userId: string; role: AssignableMemberRole } | null {
  if (!body || typeof body !== 'object') return null
  const { userId, role } = body as Record<string, unknown>
  if (typeof userId !== 'string' || !userId.trim()) return null
  if (!ASSIGNABLE_MEMBER_ROLES.includes(role as AssignableMemberRole)) return null
  return { userId, role: role as AssignableMemberRole }
}
