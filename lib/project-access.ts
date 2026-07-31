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
  const isMembershipManager = Boolean(
    membership && MANAGER_MEMBERSHIP_ROLES.has(membership.role.trim().toUpperCase())
  )

  return {
    canAccess: isHr || isOwner || Boolean(membership),
    canManage: isHr || isOwner || isMembershipManager,
    membershipRole: membership?.role || null,
  }
}

export function canEditAssignedProjectTask(input: {
  viewerId: string
  assigneeId: string | null
  canManage: boolean
}) {
  return input.canManage || input.assigneeId === input.viewerId
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
