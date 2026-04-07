import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import type { RelationshipType } from '@/types'
import {
  createLogicalEvaluatorMapping,
  deleteLogicalEvaluatorMappingById,
  getPhysicalMappingsForLogicalRelationship,
  getMappingPairKey,
  shouldSkipMappingParticipants,
} from '@/lib/evaluation-mappings'
import { getCollapsedAdminMappings } from '@/lib/evaluation-assignments'
import { getMappingConstraint } from '@/lib/evaluation-profile-rules'
import { syncConstantEvaluatorMappingsForUsers } from '@/lib/evaluation-constants'

// GET - List all evaluator mappings
export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const evaluateeId = searchParams.get('evaluateeId')
    const evaluatorId = searchParams.get('evaluatorId')

    const allMappings = (await getCollapsedAdminMappings()).filter(
      (mapping) => !shouldSkipMappingParticipants([mapping.evaluator, mapping.evaluatee])
    )
    const mappings = allMappings.filter((mapping) => {
      if (evaluateeId && mapping.evaluateeId !== evaluateeId) return false
      if (evaluatorId && mapping.evaluatorId !== evaluatorId) return false
      return true
    })

    return NextResponse.json({ mappings })
  } catch (error) {
    console.error('Failed to fetch mappings:', error)
    return NextResponse.json(
      { error: 'Failed to fetch mappings' },
      { status: 500 }
    )
  }
}

// POST - Create a new mapping
export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { evaluatorId, evaluateeId, relationshipType } = await request.json()

    if (!evaluatorId || !evaluateeId || !relationshipType) {
      return NextResponse.json(
        { error: 'Evaluator, evaluatee, and relationship type are required' },
        { status: 400 }
      )
    }

    const participants = await prisma.user.findMany({
      where: {
        id: { in: [...new Set([evaluatorId, evaluateeId])] },
      },
      select: {
        id: true,
        name: true,
        department: true,
      },
    })

    if (participants.length !== [...new Set([evaluatorId, evaluateeId])].length) {
      return NextResponse.json({ error: 'Evaluator or evaluatee not found' }, { status: 404 })
    }

    if (shouldSkipMappingParticipants(participants)) {
      return NextResponse.json(
        { error: '3E employees are managed separately and cannot be added to these mappings' },
        { status: 400 }
      )
    }

    const usersById = new Map(participants.map((participant) => [participant.id, participant]))
    const constraint = getMappingConstraint(
      {
        evaluatorId,
        evaluateeId,
        relationshipType: relationshipType as RelationshipType,
      },
      usersById
    )

    if (constraint.blocked) {
      return NextResponse.json({ error: constraint.reason }, { status: 400 })
    }

    await prisma.$transaction(async (tx) => {
      await createLogicalEvaluatorMapping(
        tx,
        {
          evaluatorId,
          evaluateeId,
          relationshipType: relationshipType as RelationshipType,
        },
        {
          skipManagementMirror: constraint.skipManagementMirror,
        }
      )
      await syncConstantEvaluatorMappingsForUsers(tx, [evaluatorId, evaluateeId])
    })

    const targetPairKey = getMappingPairKey({
      evaluatorId,
      evaluateeId,
      relationshipType: relationshipType as RelationshipType,
    })
    const mappings = await getCollapsedAdminMappings()
    const mapping =
      mappings.find(
        (entry) =>
          entry.evaluatorId === evaluatorId &&
          entry.evaluateeId === evaluateeId &&
          entry.relationshipType === relationshipType
      ) ||
      mappings.find((entry) => getMappingPairKey(entry) === targetPairKey) ||
      null

    return NextResponse.json({ success: true, mapping })
  } catch (error) {
    console.error('Failed to create mapping:', error)
    return NextResponse.json(
      { error: 'Failed to create mapping' },
      { status: 500 }
    )
  }
}

// DELETE - Delete a mapping
export async function DELETE(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Mapping ID is required' }, { status: 400 })
    }

    const deleted = await prisma.$transaction(async (tx) => {
      const mapping = await deleteLogicalEvaluatorMappingById(tx, id)

      if (mapping) {
        const affectedEvaluateeIds = [
          ...new Set(
            getPhysicalMappingsForLogicalRelationship({
              evaluatorId: mapping.evaluatorId,
              evaluateeId: mapping.evaluateeId,
              relationshipType: mapping.relationshipType as RelationshipType,
            }).map((entry) => entry.evaluateeId)
          ),
        ]

        await syncConstantEvaluatorMappingsForUsers(tx, affectedEvaluateeIds)
      }

      return mapping
    })

    if (!deleted) {
      return NextResponse.json({ error: 'Mapping not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete mapping:', error)
    return NextResponse.json(
      { error: 'Failed to delete mapping' },
      { status: 500 }
    )
  }
}

// PUT - Bulk import mappings
export async function PUT(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { mappings } = await request.json()

    if (!Array.isArray(mappings) || mappings.length === 0) {
      return NextResponse.json({ error: 'Mappings array is required' }, { status: 400 })
    }

    const results = {
      created: 0,
      skipped: 0,
      errors: [] as string[],
    }
    const touchedUserIds = new Set<string>()

    for (const mapping of mappings) {
      try {
        // Find users by name or email
        let evaluator = await prisma.user.findFirst({
          where: {
            OR: [
              { name: { contains: mapping.evaluatorName, mode: 'insensitive' } },
              { email: { equals: mapping.evaluatorEmail, mode: 'insensitive' } },
            ],
          },
        })

        let evaluatee = await prisma.user.findFirst({
          where: {
            OR: [
              { name: { contains: mapping.evaluateeName, mode: 'insensitive' } },
              { email: { equals: mapping.evaluateeEmail, mode: 'insensitive' } },
            ],
          },
        })

        if (!evaluator) {
          results.errors.push(`Evaluator not found: ${mapping.evaluatorName || mapping.evaluatorEmail}`)
          continue
        }

        if (!evaluatee) {
          results.errors.push(`Evaluatee not found: ${mapping.evaluateeName || mapping.evaluateeEmail}`)
          continue
        }

        if (shouldSkipMappingParticipants([evaluator, evaluatee])) {
          results.skipped++
          continue
        }

        const usersById = new Map([
          [evaluator.id, evaluator],
          [evaluatee.id, evaluatee],
        ])
        const constraint = getMappingConstraint(
          {
            evaluatorId: evaluator.id,
            evaluateeId: evaluatee.id,
            relationshipType: mapping.relationshipType as RelationshipType,
          },
          usersById
        )

        if (constraint.blocked) {
          results.skipped++
          results.errors.push(constraint.reason || 'Mapping violates evaluation rules')
          continue
        }

        await createLogicalEvaluatorMapping(
          prisma,
          {
            evaluatorId: evaluator.id,
            evaluateeId: evaluatee.id,
            relationshipType: mapping.relationshipType as RelationshipType,
          },
          {
            skipManagementMirror: constraint.skipManagementMirror,
          }
        )
        touchedUserIds.add(evaluator.id)
        touchedUserIds.add(evaluatee.id)

        results.created++
      } catch (error) {
        console.error('Error processing mapping:', error)
        results.errors.push('Error processing mapping')
      }
    }

    await syncConstantEvaluatorMappingsForUsers(prisma, [...touchedUserIds])

    return NextResponse.json({ success: true, results })
  } catch (error) {
    console.error('Failed to import mappings:', error)
    return NextResponse.json(
      { error: 'Failed to import mappings' },
      { status: 500 }
    )
  }
}

