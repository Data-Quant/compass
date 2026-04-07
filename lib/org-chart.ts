import type { RelationshipType } from '@/types'

export type OrgChartUser = {
  id: string
  name: string
  department: string | null
  position: string | null
  role: string
  chartX: number | null
  chartY: number | null
}

export type OrgChartMapping = {
  id: string
  evaluatorId: string
  evaluateeId: string
  relationshipType: RelationshipType
  evaluator: Pick<OrgChartUser, 'id' | 'name' | 'department' | 'position' | 'role'>
  evaluatee: Pick<OrgChartUser, 'id' | 'name' | 'department' | 'position' | 'role'>
}

export type OrgChartMeta = {
  topLevelLeaderIds: string[]
  isolatedUserIds: string[]
  relationshipCounts: Record<RelationshipType, number>
}

export type OrgChartLayoutNode = {
  id: string
  kind: 'employee' | 'company'
  userId?: string
  position: { x: number; y: number }
}

export type OrgChartLayoutEdge = {
  id: string
  source: string
  target: string
  relationshipType?: RelationshipType
  label: string
  color: string
  synthetic?: boolean
}

type OverviewOptions = {
  searchTerm?: string
  relationshipFilter?: RelationshipType | 'all'
  isolateUserId?: string | null
}

type FocusedOptions = {
  selectedUserId: string
  relationshipFilter?: RelationshipType | 'all'
}

const RELATIONSHIP_TYPES: RelationshipType[] = [
  'TEAM_LEAD',
  'DIRECT_REPORT',
  'PEER',
  'HR',
  'C_LEVEL',
  'DEPT',
  'CROSS_DEPARTMENT',
  'SELF',
]

export const ORG_CHART_EDGE_COLORS: Record<RelationshipType, string> = {
  TEAM_LEAD: '#2563EB',
  DIRECT_REPORT: '#F97316',
  PEER: '#A855F7',
  HR: '#EC4899',
  C_LEVEL: '#22C55E',
  DEPT: '#EAB308',
  CROSS_DEPARTMENT: '#14B8A6',
  SELF: '#94A3B8',
}

export const ORG_CHART_EDGE_LABELS: Record<RelationshipType, string> = {
  TEAM_LEAD: 'Lead',
  DIRECT_REPORT: 'Report',
  PEER: 'Peer',
  HR: 'HR',
  C_LEVEL: 'Hamiz',
  DEPT: 'Dept',
  CROSS_DEPARTMENT: 'Cross',
  SELF: 'Self',
}

function sortUsersByName<T extends { id: string; name: string }>(users: T[]) {
  return [...users].sort(
    (left, right) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }) ||
      left.id.localeCompare(right.id)
  )
}

function filterMappingsByRelationship(
  mappings: OrgChartMapping[],
  relationshipFilter: RelationshipType | 'all'
) {
  if (relationshipFilter === 'all') {
    return mappings
  }

  return mappings.filter((mapping) => mapping.relationshipType === relationshipFilter)
}

function createRelationshipEdge(mapping: OrgChartMapping): OrgChartLayoutEdge {
  return {
    id: mapping.id,
    source: mapping.evaluatorId,
    target: mapping.evaluateeId,
    relationshipType: mapping.relationshipType,
    label: ORG_CHART_EDGE_LABELS[mapping.relationshipType],
    color: ORG_CHART_EDGE_COLORS[mapping.relationshipType],
  }
}

function createCenteredVerticalPositions(count: number, x: number, centerY: number, gap = 116) {
  if (count === 0) return [] as Array<{ x: number; y: number }>

  const startY = centerY - ((count - 1) * gap) / 2
  return Array.from({ length: count }, (_, index) => ({
    x,
    y: startY + index * gap,
  }))
}

function createCenteredHorizontalPositions(count: number, centerX: number, y: number, gap = 150) {
  if (count === 0) return [] as Array<{ x: number; y: number }>

  const startX = centerX - ((count - 1) * gap) / 2
  return Array.from({ length: count }, (_, index) => ({
    x: startX + index * gap,
    y,
  }))
}

function getNeighborhoodUserIds(
  userId: string,
  mappings: OrgChartMapping[]
) {
  const ids = new Set<string>([userId])

  for (const mapping of mappings) {
    if (mapping.evaluatorId === userId) {
      ids.add(mapping.evaluateeId)
    }
    if (mapping.evaluateeId === userId) {
      ids.add(mapping.evaluatorId)
    }
  }

  return ids
}

function getDepartmentGroups(users: OrgChartUser[]) {
  const groups = new Map<string, OrgChartUser[]>()

  for (const user of users) {
    const key = user.department || 'No Department'
    if (!groups.has(key)) {
      groups.set(key, [])
    }
    groups.get(key)!.push(user)
  }

  return [...groups.entries()]
    .map(([department, groupUsers]) => ({
      department,
      users: sortUsersByName(groupUsers),
    }))
    .sort(
      (left, right) =>
        right.users.length - left.users.length ||
        left.department.localeCompare(right.department, undefined, { sensitivity: 'base' })
    )
}

export function buildOrgChartMeta(
  users: OrgChartUser[],
  mappings: OrgChartMapping[]
): OrgChartMeta {
  const relationshipCounts = Object.fromEntries(
    RELATIONSHIP_TYPES.map((type) => [type, 0])
  ) as Record<RelationshipType, number>

  const connectedUserIds = new Set<string>()
  const usersWithIncomingTeamLead = new Set<string>()

  for (const mapping of mappings) {
    relationshipCounts[mapping.relationshipType] += 1
    connectedUserIds.add(mapping.evaluatorId)
    connectedUserIds.add(mapping.evaluateeId)

    if (mapping.relationshipType === 'TEAM_LEAD') {
      usersWithIncomingTeamLead.add(mapping.evaluateeId)
    }
  }

  const sortedUsers = sortUsersByName(users)

  return {
    topLevelLeaderIds: sortedUsers
      .filter((user) => !usersWithIncomingTeamLead.has(user.id))
      .map((user) => user.id),
    isolatedUserIds: sortedUsers
      .filter((user) => !connectedUserIds.has(user.id))
      .map((user) => user.id),
    relationshipCounts,
  }
}

export function buildFocusedOrgChartScene(
  users: OrgChartUser[],
  mappings: OrgChartMapping[],
  options: FocusedOptions
) {
  const selectedUser = users.find((user) => user.id === options.selectedUserId)
  if (!selectedUser) {
    return {
      nodes: [] as OrgChartLayoutNode[],
      edges: [] as OrgChartLayoutEdge[],
      visibleUserIds: [] as string[],
    }
  }

  const filteredMappings = filterMappingsByRelationship(
    mappings,
    options.relationshipFilter || 'all'
  ).filter(
    (mapping) =>
      mapping.evaluatorId === selectedUser.id || mapping.evaluateeId === selectedUser.id
  )

  const usersById = new Map(users.map((user) => [user.id, user]))
  const relationshipsByUser = new Map<
    string,
    {
      incoming: OrgChartMapping[]
      outgoing: OrgChartMapping[]
      peer: OrgChartMapping[]
    }
  >()

  for (const mapping of filteredMappings) {
    const isPeer = mapping.relationshipType === 'PEER'
    const otherUserId =
      mapping.evaluatorId === selectedUser.id ? mapping.evaluateeId : mapping.evaluatorId

    if (!relationshipsByUser.has(otherUserId)) {
      relationshipsByUser.set(otherUserId, {
        incoming: [],
        outgoing: [],
        peer: [],
      })
    }

    const bucket = relationshipsByUser.get(otherUserId)!

    if (isPeer) {
      bucket.peer.push(mapping)
    } else if (mapping.evaluateeId === selectedUser.id) {
      bucket.incoming.push(mapping)
    } else {
      bucket.outgoing.push(mapping)
    }
  }

  const bidirectional: OrgChartUser[] = []
  const incomingOnly: OrgChartUser[] = []
  const outgoingOnly: OrgChartUser[] = []
  const peerOnly: OrgChartUser[] = []

  for (const [userId, grouped] of relationshipsByUser.entries()) {
    const user = usersById.get(userId)
    if (!user) continue

    if (grouped.peer.length > 0 && grouped.incoming.length === 0 && grouped.outgoing.length === 0) {
      peerOnly.push(user)
    } else if (grouped.incoming.length > 0 && grouped.outgoing.length > 0) {
      bidirectional.push(user)
    } else if (grouped.incoming.length > 0) {
      incomingOnly.push(user)
    } else {
      outgoingOnly.push(user)
    }
  }

  const nodes: OrgChartLayoutNode[] = [
    {
      id: selectedUser.id,
      kind: 'employee',
      userId: selectedUser.id,
      position: { x: 520, y: 280 },
    },
  ]

  const visibleUserIds = new Set<string>([selectedUser.id])

  createCenteredVerticalPositions(incomingOnly.length, 150, 280).forEach((position, index) => {
    const user = sortUsersByName(incomingOnly)[index]
    nodes.push({
      id: user.id,
      kind: 'employee',
      userId: user.id,
      position,
    })
    visibleUserIds.add(user.id)
  })

  createCenteredHorizontalPositions(bidirectional.length, 520, 80).forEach((position, index) => {
    const user = sortUsersByName(bidirectional)[index]
    nodes.push({
      id: user.id,
      kind: 'employee',
      userId: user.id,
      position,
    })
    visibleUserIds.add(user.id)
  })

  createCenteredVerticalPositions(outgoingOnly.length, 890, 280).forEach((position, index) => {
    const user = sortUsersByName(outgoingOnly)[index]
    nodes.push({
      id: user.id,
      kind: 'employee',
      userId: user.id,
      position,
    })
    visibleUserIds.add(user.id)
  })

  createCenteredHorizontalPositions(peerOnly.length, 520, 520).forEach((position, index) => {
    const user = sortUsersByName(peerOnly)[index]
    nodes.push({
      id: user.id,
      kind: 'employee',
      userId: user.id,
      position,
    })
    visibleUserIds.add(user.id)
  })

  return {
    nodes,
    edges: filteredMappings.map(createRelationshipEdge),
    visibleUserIds: [...visibleUserIds],
  }
}

export function buildOverviewOrgChartScene(
  users: OrgChartUser[],
  mappings: OrgChartMapping[],
  options: OverviewOptions = {}
) {
  const filteredMappings = filterMappingsByRelationship(
    mappings,
    options.relationshipFilter || 'all'
  )

  let visibleUserIds = new Set<string>(users.map((user) => user.id))

  if (options.isolateUserId) {
    visibleUserIds = getNeighborhoodUserIds(options.isolateUserId, filteredMappings)
  } else if (options.searchTerm?.trim()) {
    const normalizedSearch = options.searchTerm.trim().toLowerCase()
    const matchedIds = users
      .filter((user) => user.name.toLowerCase().includes(normalizedSearch))
      .map((user) => user.id)

    visibleUserIds = new Set<string>()
    for (const matchedId of matchedIds) {
      for (const neighborId of getNeighborhoodUserIds(matchedId, filteredMappings)) {
        visibleUserIds.add(neighborId)
      }
    }
  }

  const visibleUsers = sortUsersByName(users.filter((user) => visibleUserIds.has(user.id)))
  const groups = getDepartmentGroups(visibleUsers)
  const nodes: OrgChartLayoutNode[] = []

  groups.forEach((group, groupIndex) => {
    const clusterColumn = groupIndex % 3
    const clusterRow = Math.floor(groupIndex / 3)
    const clusterCenterX = 220 + clusterColumn * 360
    const clusterCenterY = 180 + clusterRow * 280

    group.users.forEach((user, userIndex) => {
      const row = Math.floor(userIndex / 3)
      const col = userIndex % 3
      const defaultX = clusterCenterX + (col - 1) * 112
      const defaultY = clusterCenterY + row * 100

      nodes.push({
        id: user.id,
        kind: 'employee',
        userId: user.id,
        position: {
          x: user.chartX ?? defaultX,
          y: user.chartY ?? defaultY,
        },
      })
    })
  })

  return {
    nodes,
    edges: filteredMappings
      .filter(
        (mapping) =>
          visibleUserIds.has(mapping.evaluatorId) && visibleUserIds.has(mapping.evaluateeId)
      )
      .map(createRelationshipEdge),
    visibleUserIds: [...visibleUserIds],
  }
}

export function buildHierarchyOrgChartScene(
  users: OrgChartUser[],
  mappings: OrgChartMapping[]
) {
  const teamLeadMappings = mappings.filter((mapping) => mapping.relationshipType === 'TEAM_LEAD')
  const meta = buildOrgChartMeta(users, mappings)
  const usersById = new Map(users.map((user) => [user.id, user]))
  const childrenMap = new Map<string, Set<string>>()

  for (const mapping of teamLeadMappings) {
    if (!childrenMap.has(mapping.evaluatorId)) {
      childrenMap.set(mapping.evaluatorId, new Set())
    }
    childrenMap.get(mapping.evaluatorId)!.add(mapping.evaluateeId)
  }

  const levels = new Map<string, number>()
  for (const userId of meta.topLevelLeaderIds) {
    levels.set(userId, 1)
  }

  for (let iteration = 0; iteration < users.length; iteration += 1) {
    let changed = false

    for (const mapping of teamLeadMappings) {
      const parentLevel = levels.get(mapping.evaluatorId) ?? 1
      const nextLevel = parentLevel + 1
      if ((levels.get(mapping.evaluateeId) ?? 0) < nextLevel) {
        levels.set(mapping.evaluateeId, nextLevel)
        changed = true
      }
    }

    if (!changed) {
      break
    }
  }

  for (const user of users) {
    if (!levels.has(user.id)) {
      levels.set(user.id, 1)
    }
  }

  const usersByLevel = new Map<number, OrgChartUser[]>()
  for (const user of users) {
    const level = levels.get(user.id) || 1
    if (!usersByLevel.has(level)) {
      usersByLevel.set(level, [])
    }
    usersByLevel.get(level)!.push(user)
  }

  const orderedLevels = [...usersByLevel.keys()].sort((left, right) => left - right)
  const nodes: OrgChartLayoutNode[] = [
    {
      id: 'company',
      kind: 'company',
      position: { x: 520, y: 40 },
    },
  ]

  for (const level of orderedLevels) {
    const levelUsers = sortUsersByName(usersByLevel.get(level) || [])
    const positions = createCenteredHorizontalPositions(levelUsers.length, 520, 140 + level * 160)

    levelUsers.forEach((user, index) => {
      nodes.push({
        id: user.id,
        kind: 'employee',
        userId: user.id,
        position: {
          x: user.chartX ?? positions[index].x,
          y: user.chartY ?? positions[index].y,
        },
      })
    })
  }

  const edges: OrgChartLayoutEdge[] = meta.topLevelLeaderIds.map((userId) => ({
    id: `company-${userId}`,
    source: 'company',
    target: userId,
    label: 'Top Level',
    color: '#94A3B8',
    synthetic: true,
  }))

  for (const mapping of teamLeadMappings) {
    edges.push(createRelationshipEdge(mapping))
  }

  return {
    nodes,
    edges,
    visibleUserIds: users.map((user) => user.id),
  }
}

