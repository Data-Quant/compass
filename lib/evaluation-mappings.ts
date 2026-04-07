import { prisma } from '@/lib/db'
import type { Prisma, EvaluatorMapping } from '@prisma/client'
import type { RelationshipType } from '@/types'
import { isThreeEDepartment } from '@/lib/company-branding'

type DbClient = typeof prisma | Prisma.TransactionClient

type MappingShape<TUser = unknown> = {
  id: string
  evaluatorId: string
  evaluateeId: string
  relationshipType: RelationshipType
  evaluator?: TUser
  evaluatee?: TUser
}

type ManagementMappingInput = Pick<
  MappingShape,
  'evaluatorId' | 'evaluateeId' | 'relationshipType'
>

type PhysicalMappingRow = {
  evaluatorId: string
  evaluateeId: string
  relationshipType: RelationshipType
}

type MappingUserShape = {
  department?: string | null
}

export function isMirroredRelationshipType(type: RelationshipType) {
  return type === 'TEAM_LEAD' || type === 'DIRECT_REPORT' || type === 'PEER'
}

export function getInverseRelationshipType(type: RelationshipType): RelationshipType | null {
  if (type === 'TEAM_LEAD') return 'DIRECT_REPORT'
  if (type === 'DIRECT_REPORT') return 'TEAM_LEAD'
  if (type === 'PEER') return 'PEER'
  return null
}

export function normalizeRelationshipTypeForManagement(type: RelationshipType): RelationshipType {
  return type === 'DIRECT_REPORT' ? 'TEAM_LEAD' : type
}

export function getCanonicalManagementPair(mapping: ManagementMappingInput) {
  if (mapping.relationshipType === 'TEAM_LEAD') {
    return {
      leaderId: mapping.evaluatorId,
      reportId: mapping.evaluateeId,
    }
  }

  if (mapping.relationshipType === 'DIRECT_REPORT') {
    return {
      leaderId: mapping.evaluateeId,
      reportId: mapping.evaluatorId,
    }
  }

  return null
}

function getCanonicalLogicalKey(mapping: ManagementMappingInput) {
  const managementPair = getCanonicalManagementPair(mapping)
  if (managementPair) {
    return `TEAM_LEAD:${managementPair.leaderId}:${managementPair.reportId}`
  }

  if (mapping.relationshipType === 'PEER') {
    const [firstId, secondId] = [mapping.evaluatorId, mapping.evaluateeId].sort()
    return `PEER:${firstId}:${secondId}`
  }

  return `${mapping.relationshipType}:${mapping.evaluatorId}:${mapping.evaluateeId}`
}

type CollapseOptions = {
  collapseManagementRelationships?: boolean
}

function buildLogicalDisplayMapping<TUser>(
  mapping: MappingShape<TUser>,
  options: CollapseOptions = {}
): MappingShape<TUser> {
  const collapseManagementRelationships =
    options.collapseManagementRelationships !== false

  if (collapseManagementRelationships && mapping.relationshipType === 'DIRECT_REPORT') {
    return {
      ...mapping,
      evaluatorId: mapping.evaluateeId,
      evaluateeId: mapping.evaluatorId,
      relationshipType: 'TEAM_LEAD',
      evaluator: mapping.evaluatee,
      evaluatee: mapping.evaluator,
    }
  }

  if (mapping.relationshipType === 'PEER') {
    const evaluatorName =
      typeof mapping.evaluator === 'object' && mapping.evaluator && 'name' in mapping.evaluator
        ? String((mapping.evaluator as { name?: string }).name || '')
        : ''
    const evaluateeName =
      typeof mapping.evaluatee === 'object' && mapping.evaluatee && 'name' in mapping.evaluatee
        ? String((mapping.evaluatee as { name?: string }).name || '')
        : ''

    const shouldFlip =
      evaluateeName.localeCompare(evaluatorName, undefined, { sensitivity: 'base' }) < 0 ||
      (evaluateeName.localeCompare(evaluatorName, undefined, { sensitivity: 'base' }) === 0 &&
        mapping.evaluateeId.localeCompare(mapping.evaluatorId) < 0)

    if (shouldFlip) {
      return {
        ...mapping,
        evaluatorId: mapping.evaluateeId,
        evaluateeId: mapping.evaluatorId,
        evaluator: mapping.evaluatee,
        evaluatee: mapping.evaluator,
      }
    }
  }

  return mapping
}

export function collapseLogicalMappings<TUser>(
  mappings: Array<MappingShape<TUser>>,
  options: CollapseOptions = {}
): Array<MappingShape<TUser>> {
  const collapseManagementRelationships =
    options.collapseManagementRelationships !== false
  const seen = new Set<string>()
  const collapsed: Array<MappingShape<TUser>> = []

  for (const mapping of mappings) {
    const key =
      collapseManagementRelationships || mapping.relationshipType === 'PEER'
        ? getCanonicalLogicalKey(mapping)
        : `${mapping.relationshipType}:${mapping.evaluatorId}:${mapping.evaluateeId}`
    if (seen.has(key)) {
      continue
    }

    seen.add(key)
    collapsed.push(
      buildLogicalDisplayMapping(mapping, {
        collapseManagementRelationships,
      })
    )
  }

  return collapsed
}

export function collapseAdminMappings<TUser>(
  mappings: Array<MappingShape<TUser>>
): Array<MappingShape<TUser>> {
  return collapseLogicalMappings(mappings, {
    collapseManagementRelationships: false,
  })
}

export function getPhysicalMappingsForLogicalRelationship(
  input: {
    evaluatorId: string
    evaluateeId: string
    relationshipType: RelationshipType
  },
  options: {
    skipManagementMirror?: boolean
  } = {}
): PhysicalMappingRow[] {
  const managementPair = getCanonicalManagementPair(input)

  if (managementPair) {
    const rows: PhysicalMappingRow[] = [
      {
        evaluatorId: managementPair.leaderId,
        evaluateeId: managementPair.reportId,
        relationshipType: 'TEAM_LEAD' as const,
      },
    ]

    if (!options.skipManagementMirror) {
      rows.push({
        evaluatorId: managementPair.reportId,
        evaluateeId: managementPair.leaderId,
        relationshipType: 'DIRECT_REPORT' as const,
      })
    }

    return rows
  }

  if (input.relationshipType === 'PEER') {
    const pair = [
      {
        evaluatorId: input.evaluatorId,
        evaluateeId: input.evaluateeId,
        relationshipType: 'PEER' as const,
      },
    ]

    if (input.evaluatorId !== input.evaluateeId) {
      pair.push({
        evaluatorId: input.evaluateeId,
        evaluateeId: input.evaluatorId,
        relationshipType: 'PEER' as const,
      })
    }

    return pair
  }

  return [
    {
      evaluatorId: input.evaluatorId,
      evaluateeId: input.evaluateeId,
      relationshipType: input.relationshipType,
    },
  ]
}

export async function createLogicalEvaluatorMapping(
  db: DbClient,
  input: {
    evaluatorId: string
    evaluateeId: string
    relationshipType: RelationshipType
  },
  options: {
    skipManagementMirror?: boolean
  } = {}
) {
  const physicalMappings = getPhysicalMappingsForLogicalRelationship(input, options)

  for (const mapping of physicalMappings) {
    await db.evaluatorMapping.upsert({
      where: {
        evaluatorId_evaluateeId_relationshipType: {
          evaluatorId: mapping.evaluatorId,
          evaluateeId: mapping.evaluateeId,
          relationshipType: mapping.relationshipType,
        },
      },
      update: {},
      create: {
        evaluatorId: mapping.evaluatorId,
        evaluateeId: mapping.evaluateeId,
        relationshipType: mapping.relationshipType,
      },
    })
  }
}

export async function deleteLogicalEvaluatorMappingById(db: DbClient, id: string) {
  const mapping = await db.evaluatorMapping.findUnique({
    where: { id },
  })

  if (!mapping) {
    return null
  }

  const physicalMappings = getPhysicalMappingsForLogicalRelationship({
    evaluatorId: mapping.evaluatorId,
    evaluateeId: mapping.evaluateeId,
    relationshipType: mapping.relationshipType as RelationshipType,
  })

  await db.evaluatorMapping.deleteMany({
    where: {
      OR: physicalMappings.map((entry) => ({
        evaluatorId: entry.evaluatorId,
        evaluateeId: entry.evaluateeId,
        relationshipType: entry.relationshipType,
      })),
    },
  })

  return mapping
}

export function countLogicalMappings(mappings: Pick<MappingShape, 'evaluatorId' | 'evaluateeId' | 'relationshipType'>[]) {
  return new Set(mappings.map(getCanonicalLogicalKey)).size
}

export function getMappingPairKey(mapping: Pick<EvaluatorMapping, 'evaluatorId' | 'evaluateeId' | 'relationshipType'>) {
  return getCanonicalLogicalKey({
    evaluatorId: mapping.evaluatorId,
    evaluateeId: mapping.evaluateeId,
    relationshipType: mapping.relationshipType as RelationshipType,
  })
}

export function isExcludedMappingUser(user: MappingUserShape | null | undefined) {
  return isThreeEDepartment(user?.department)
}

export function shouldSkipMappingParticipants(
  participants: Array<MappingUserShape | null | undefined>
) {
  return participants.some((participant) => isExcludedMappingUser(participant))
}
