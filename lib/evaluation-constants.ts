import { prisma } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { HAMIZ_EVALUATOR, HR_EVALUATORS } from '@/lib/config'
import {
  PROFILE_BASE_RELATIONSHIP_TYPES,
  shouldReceiveConstantEvaluations,
} from '@/lib/evaluation-profile-rules'

type DbClient = typeof prisma | Prisma.TransactionClient

type SyncUser = {
  id: string
  name: string
  department: string | null
}

type MappingTriple = { evaluatorId: string; evaluateeId: string; relationshipType: string }
const isAutomaticType = (relationshipType: string) => relationshipType === 'HR' || relationshipType === 'DEPT'

/** HR deleted an automatic mapping (HR or Hamiz's department one): remember it, so the sync does not add it back. */
export async function recordAutomaticMappingDeletion(db: DbClient, mapping: MappingTriple, actorId: string | null) {
  if (!isAutomaticType(mapping.relationshipType)) return
  const key = { evaluatorId: mapping.evaluatorId, evaluateeId: mapping.evaluateeId, relationshipType: mapping.relationshipType as 'HR' | 'DEPT' }
  await db.evaluatorMappingExclusion.upsert({
    where: { evaluatorId_evaluateeId_relationshipType: key },
    create: { ...key, createdById: actorId },
    update: { createdById: actorId },
  })
}

/** HR added an automatic mapping back by hand: it is automatic again. */
export async function clearAutomaticMappingDeletion(db: DbClient, mapping: MappingTriple) {
  if (!isAutomaticType(mapping.relationshipType)) return
  await db.evaluatorMappingExclusion.deleteMany({
    where: { evaluatorId: mapping.evaluatorId, evaluateeId: mapping.evaluateeId, relationshipType: mapping.relationshipType as 'HR' | 'DEPT' },
  })
}

export async function syncConstantEvaluatorMappingsForUsers(
  db: DbClient,
  evaluateeIds: string[]
) {
  const targetIds = [...new Set(evaluateeIds.filter(Boolean))]
  if (targetIds.length === 0) {
    return {
      deletedIncomingForExcluded: 0,
      deletedConstantMappings: 0,
      createdConstantMappings: 0,
    }
  }

  const users = await db.user.findMany({
    where: { id: { in: targetIds } },
    select: {
      id: true,
      name: true,
      department: true,
    },
  })

  const userMap = new Map(users.map((user) => [user.id, user]))
  const eligibleUsers = users.filter((user) => shouldReceiveConstantEvaluations(user))
  const excludedIds = users
    .filter((user) => !shouldReceiveConstantEvaluations(user))
    .map((user) => user.id)

  const deletedIncomingForExcluded =
    excludedIds.length > 0
      ? (
          await db.evaluatorMapping.deleteMany({
            where: {
              evaluateeId: { in: excludedIds },
            },
          })
        ).count
      : 0

  const baseMappings = await db.evaluatorMapping.findMany({
    where: {
      evaluateeId: { in: eligibleUsers.map((user) => user.id) },
      relationshipType: { in: PROFILE_BASE_RELATIONSHIP_TYPES },
    },
    select: {
      evaluateeId: true,
    },
  })

  const usersWithBaseMappings = new Set(baseMappings.map((mapping) => mapping.evaluateeId))
  const activeEvaluateeIds = eligibleUsers
    .map((user) => user.id)
    .filter((userId) => usersWithBaseMappings.has(userId))
  const inactiveEvaluateeIds = eligibleUsers
    .map((user) => user.id)
    .filter((userId) => !usersWithBaseMappings.has(userId))

  const constantTypes = ['HR', 'DEPT'] as const

  const deletedConstantMappings =
    inactiveEvaluateeIds.length > 0
      ? (
          await db.evaluatorMapping.deleteMany({
            where: {
              evaluateeId: { in: inactiveEvaluateeIds },
              relationshipType: { in: [...constantTypes] },
            },
          })
        ).count
      : 0

  if (activeEvaluateeIds.length === 0) {
    return {
      deletedIncomingForExcluded,
      deletedConstantMappings,
      createdConstantMappings: 0,
    }
  }

  const hrEvaluators = await db.user.findMany({
    where: {
      name: { in: HR_EVALUATORS },
    },
    select: {
      id: true,
      name: true,
      department: true,
    },
  })

  const hamiz = await db.user.findFirst({
    where: {
      name: { equals: HAMIZ_EVALUATOR, mode: 'insensitive' },
    },
    select: {
      id: true,
      name: true,
      department: true,
    },
  })

  const rows: Array<{
    evaluatorId: string
    evaluateeId: string
    relationshipType: 'HR' | 'DEPT'
  }> = []

  for (const evaluateeId of activeEvaluateeIds) {
    const evaluatee = userMap.get(evaluateeId)
    if (!evaluatee || !shouldReceiveConstantEvaluations(evaluatee)) {
      continue
    }

    for (const hr of hrEvaluators) {
      if (hr.id === evaluateeId) {
        continue
      }

      rows.push({
        evaluatorId: hr.id,
        evaluateeId,
        relationshipType: 'HR',
      })
    }

    if (hamiz && hamiz.id !== evaluateeId) {
      rows.push({
        evaluatorId: hamiz.id,
        evaluateeId,
        relationshipType: 'DEPT',
      })
    }
  }

  const existingConstants = await db.evaluatorMapping.findMany({
    where: {
      evaluateeId: { in: activeEvaluateeIds },
      relationshipType: { in: [...constantTypes] },
    },
    select: {
      evaluatorId: true,
      evaluateeId: true,
      relationshipType: true,
    },
  })

  const existingKeys = new Set(
    existingConstants.map(
      (mapping) => `${mapping.evaluatorId}:${mapping.evaluateeId}:${mapping.relationshipType}`
    )
  )
  // Automatic mappings HR deleted on purpose stay deleted.
  const excludedKeys = new Set(
    (
      await db.evaluatorMappingExclusion.findMany({
        where: { evaluateeId: { in: activeEvaluateeIds } },
        select: { evaluatorId: true, evaluateeId: true, relationshipType: true },
      })
    ).map((exclusion) => `${exclusion.evaluatorId}:${exclusion.evaluateeId}:${exclusion.relationshipType}`)
  )

  const missingRows = rows.filter((row) => {
    const key = `${row.evaluatorId}:${row.evaluateeId}:${row.relationshipType}`
    return !existingKeys.has(key) && !excludedKeys.has(key)
  })

  const createdConstantMappings =
    missingRows.length > 0
      ? (
          await db.evaluatorMapping.createMany({
            data: missingRows,
            skipDuplicates: true,
          })
        ).count
      : 0

  return {
    deletedIncomingForExcluded,
    deletedConstantMappings,
    createdConstantMappings,
  }
}
