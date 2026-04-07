import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import {
  C_LEVEL_EVALUATORS,
  isCLevelEvaluatorName,
} from '@/lib/config'
import type { RelationshipType } from '@/types'
import {
  createLogicalEvaluatorMapping,
  shouldSkipMappingParticipants,
} from '@/lib/evaluation-mappings'
import {
  getMappingConstraint,
  isNoIncomingEvaluationUser,
} from '@/lib/evaluation-profile-rules'
import {
  isHREvaluatorName,
  normalizeImportedName,
  resolveImportedName,
} from '@/lib/mapping-import'
import {
  analyzeWeightProfileAssignments,
  type WorkbookProfileDefinition,
} from '@/lib/weight-profiles'
import {
  isPeerColumnHeader,
  isReportingTeamMemberColumnHeader,
  isTeamLeadColumnHeader,
  parseEvaluationWorkbook,
  type WorkbookMappingRow,
} from '@/lib/workbook-import'
import { syncConstantEvaluatorMappingsForUsers } from '@/lib/evaluation-constants'

interface CSVRow {
  Name: string
  Designation?: string
  Department?: string
  [key: string]: string | undefined
}

interface ImportResult {
  usersCreated: number
  usersUpdated: number
  mappingsCreated: number
  mappingsSkipped: number
  profilesSeeded?: number
  constantMappingsCreated?: number
  constantMappingsDeleted?: number
  excludedIncomingMappingsDeleted?: number
  validation?: {
    matchedProfiles: number
    mismatchedProfiles: Array<{
      displayName: string
      missingExpectedMembers: string[]
      unexpectedMembers: string[]
    }>
  }
  warnings?: {
    unmatchedCategorySets: Array<{
      categorySetKey: string
      employeeCount: number
      employeeNames: string[]
      likelyMissingConstantTypes: RelationshipType[]
    }>
    mismatchedEmployees: Array<{
      employeeName: string
      categorySetKey: string
      likelyMissingConstantTypes: RelationshipType[]
    }>
  }
  errors: string[]
}

type KnownUser = {
  id: string
  name: string
  department: string | null
}

async function parseRequestPayload(request: NextRequest): Promise<{
  rows: CSVRow[]
  clearExisting: boolean
  profileDefinitions: WorkbookProfileDefinition[]
}> {
  const contentType = request.headers.get('content-type') || ''

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData()
    const file = formData.get('file')
    const clearExisting = String(formData.get('clearExisting') || 'true') !== 'false'

    if (!(file instanceof File)) {
      throw new Error('Workbook file is required')
    }

    const parsed = await parseEvaluationWorkbook(await file.arrayBuffer())
    return {
      rows: parsed.mappingRows as unknown as CSVRow[],
      clearExisting,
      profileDefinitions: parsed.profileDefinitions,
    }
  }

  const body = (await request.json()) as {
    rows: CSVRow[]
    clearExisting: boolean
  }

  return {
    rows: body.rows,
    clearExisting: body.clearExisting,
    profileDefinitions: [],
  }
}

function getColumnValues(row: Record<string, string | undefined>, matcher: (header: string) => boolean) {
  return Object.entries(row)
    .filter(([header]) => matcher(header))
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
    .map(([, value]) => value?.trim() || '')
    .filter(Boolean)
}

async function seedWorkbookProfiles(
  profileDefinitions: WorkbookProfileDefinition[]
) {
  if (profileDefinitions.length === 0) {
    return 0
  }

  for (const profile of profileDefinitions) {
    await prisma.weightProfile.upsert({
      where: { categorySetKey: profile.categorySetKey },
      update: {
        displayName: profile.displayName,
        weights: profile.weights,
      },
      create: {
        categorySetKey: profile.categorySetKey,
        displayName: profile.displayName,
        weights: profile.weights,
      },
    })
  }

  return profileDefinitions.length
}

function validateWorkbookProfiles(input: {
  profileDefinitions: WorkbookProfileDefinition[]
  users: Array<{ id: string; name: string; department: string | null }>
  assignments: ReturnType<typeof analyzeWeightProfileAssignments>
}) {
  const actualMembersByProfile = new Map<string, string[]>()

  for (const user of input.users) {
    const assignment = input.assignments.assignments.get(user.id)
    if (!assignment?.displayName) {
      continue
    }

    if (!actualMembersByProfile.has(assignment.categorySetKey)) {
      actualMembersByProfile.set(assignment.categorySetKey, [])
    }
    actualMembersByProfile.get(assignment.categorySetKey)!.push(user.name)
  }

  const mismatchedProfiles = input.profileDefinitions
    .map((profile) => {
      const expectedMembers = [...profile.expectedMembers]
        .filter((name) => !isNoIncomingEvaluationUser({ name }))
        .sort((a, b) => a.localeCompare(b))
      const actualMembers = [...(actualMembersByProfile.get(profile.categorySetKey) || [])].sort(
        (a, b) => a.localeCompare(b)
      )

      const missingExpectedMembers = expectedMembers.filter(
        (member) => !actualMembers.includes(member)
      )
      const unexpectedMembers = actualMembers.filter(
        (member) => !expectedMembers.includes(member)
      )

      return {
        displayName: profile.displayName,
        missingExpectedMembers,
        unexpectedMembers,
      }
    })
    .filter(
      (profile) =>
        profile.missingExpectedMembers.length > 0 || profile.unexpectedMembers.length > 0
    )

  return {
    matchedProfiles: input.profileDefinitions.length - mismatchedProfiles.length,
    mismatchedProfiles,
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { rows, clearExisting, profileDefinitions } = await parseRequestPayload(request)

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No data provided' }, { status: 400 })
    }

    const result: ImportResult = {
      usersCreated: 0,
      usersUpdated: 0,
      mappingsCreated: 0,
      mappingsSkipped: 0,
      errors: [],
    }

    if (clearExisting) {
      await prisma.evaluatorMapping.deleteMany({})
    }

    const userMap = new Map<string, string>()
    const userDetailsById = new Map<string, KnownUser>()

    for (const row of rows) {
      if (!row.Name || row.Name.trim() === '') continue

      const name = resolveImportedName(row.Name)
      const normalizedName = normalizeImportedName(name)
      const designation = row.Designation?.trim() || null
      const department = row.Department?.trim() || null

      try {
        const existingUser = await prisma.user.findFirst({
          where: {
            name: { equals: name, mode: 'insensitive' },
          },
        })

        if (existingUser) {
          if (designation || department) {
            await prisma.user.update({
              where: { id: existingUser.id },
              data: {
                ...(designation && { position: designation }),
                ...(department && { department }),
              },
            })
            result.usersUpdated++
          }

          userMap.set(normalizedName, existingUser.id)
          userDetailsById.set(existingUser.id, {
            id: existingUser.id,
            name: existingUser.name,
            department: department ?? existingUser.department,
          })
        } else {
          const newUser = await prisma.user.create({
            data: {
              name,
              position: designation,
              department,
              role: isHREvaluatorName(name) ? 'HR' : 'EMPLOYEE',
            },
          })

          result.usersCreated++
          userMap.set(normalizedName, newUser.id)
          userDetailsById.set(newUser.id, {
            id: newUser.id,
            name: newUser.name,
            department: newUser.department,
          })
        }
      } catch (error) {
        console.error(`Error processing user ${name}:`, error)
        result.errors.push(`Error processing user ${name}`)
      }
    }

    for (const evaluatorName of C_LEVEL_EVALUATORS) {
      const normalized = normalizeImportedName(evaluatorName)
      if (userMap.has(normalized)) continue

      const existing = await prisma.user.findFirst({
        where: { name: { equals: evaluatorName, mode: 'insensitive' } },
      })
      if (!existing) continue

      userMap.set(normalized, existing.id)
      userDetailsById.set(existing.id, {
        id: existing.id,
        name: existing.name,
        department: existing.department,
      })
    }

    async function createMapping(
      evaluatorName: string,
      evaluateeId: string,
      relationshipType: RelationshipType
    ) {
      const resolvedEvaluatorName = resolveImportedName(evaluatorName)
      const evaluatorNormalized = normalizeImportedName(resolvedEvaluatorName)
      let evaluatorId = userMap.get(evaluatorNormalized)

      if (!evaluatorId) {
        const evaluator = await prisma.user.findFirst({
          where: { name: { contains: resolvedEvaluatorName, mode: 'insensitive' } },
        })

        if (evaluator) {
          evaluatorId = evaluator.id
          userMap.set(evaluatorNormalized, evaluator.id)
          userDetailsById.set(evaluator.id, {
            id: evaluator.id,
            name: evaluator.name,
            department: evaluator.department,
          })
        } else {
          const createdEvaluator = await prisma.user.create({
            data: {
              name: resolvedEvaluatorName,
              role: isHREvaluatorName(resolvedEvaluatorName) ? 'HR' : 'EMPLOYEE',
              department: isCLevelEvaluatorName(resolvedEvaluatorName) ? 'Executive' : null,
              position: isCLevelEvaluatorName(resolvedEvaluatorName)
                ? 'C-Level Executive'
                : null,
            },
          })

          result.usersCreated++
          evaluatorId = createdEvaluator.id
          userMap.set(evaluatorNormalized, createdEvaluator.id)
          userDetailsById.set(createdEvaluator.id, {
            id: createdEvaluator.id,
            name: createdEvaluator.name,
            department: createdEvaluator.department,
          })
        }
      }

      const evaluator = userDetailsById.get(evaluatorId)
      const evaluatee = userDetailsById.get(evaluateeId)

      if (shouldSkipMappingParticipants([evaluator, evaluatee])) {
        result.mappingsSkipped++
        return
      }

      const constraint = getMappingConstraint(
        {
          evaluatorId,
          evaluateeId,
          relationshipType,
        },
        userDetailsById
      )

      if (constraint.blocked) {
        result.mappingsSkipped++
        return
      }

      await createLogicalEvaluatorMapping(
        prisma,
        {
          evaluatorId,
          evaluateeId,
          relationshipType,
        },
        {
          skipManagementMirror: constraint.skipManagementMirror,
        }
      )
      result.mappingsCreated++
    }

    for (const row of rows) {
      if (!row.Name || row.Name.trim() === '') continue

      const evaluateeName = resolveImportedName(row.Name.trim())
      const evaluateeId = userMap.get(normalizeImportedName(evaluateeName))
      if (!evaluateeId) {
        result.errors.push(`Evaluatee not found in user map: ${evaluateeName}`)
        continue
      }

      for (const teamLeadName of getColumnValues(row, isTeamLeadColumnHeader)) {
        if (isCLevelEvaluatorName(teamLeadName)) {
          await createMapping(teamLeadName, evaluateeId, 'C_LEVEL')
        } else {
          await createMapping(teamLeadName, evaluateeId, 'TEAM_LEAD')
        }
      }

      for (const peerName of getColumnValues(row, isPeerColumnHeader)) {
        await createMapping(peerName, evaluateeId, 'PEER')
      }

      for (const directReportName of getColumnValues(row, isReportingTeamMemberColumnHeader)) {
        await createMapping(directReportName, evaluateeId, 'DIRECT_REPORT')
      }
    }

    const syncResult = await syncConstantEvaluatorMappingsForUsers(
      prisma,
      [...userDetailsById.keys()]
    )

    result.constantMappingsCreated = syncResult.createdConstantMappings
    result.constantMappingsDeleted = syncResult.deletedConstantMappings
    result.excludedIncomingMappingsDeleted = syncResult.deletedIncomingForExcluded

    if (profileDefinitions.length > 0) {
      result.profilesSeeded = await seedWorkbookProfiles(profileDefinitions)

      const users = await prisma.user.findMany({
        where: {
          id: { in: [...userDetailsById.keys()] },
        },
        select: {
          id: true,
          name: true,
          department: true,
        },
      })

      const mappings = await prisma.evaluatorMapping.findMany({
        where: {
          evaluateeId: { in: users.map((entry) => entry.id) },
        },
        select: {
          evaluateeId: true,
          relationshipType: true,
        },
      })

      const savedProfiles = await prisma.weightProfile.findMany({
        select: {
          categorySetKey: true,
          displayName: true,
          weights: true,
        },
      })

      const profileAnalysis = analyzeWeightProfileAssignments({
        profiles: savedProfiles.map((profile) => ({
          categorySetKey: profile.categorySetKey,
          displayName: profile.displayName,
          weights: profile.weights as Record<string, number>,
        })),
        users,
        mappings,
      })

      result.validation = validateWorkbookProfiles({
        profileDefinitions,
        users,
        assignments: profileAnalysis,
      })
      result.warnings = {
        unmatchedCategorySets: profileAnalysis.unmatchedCategorySets,
        mismatchedEmployees: profileAnalysis.mismatchedEmployees,
      }
    }

    return NextResponse.json({ success: true, result })
  } catch (error) {
    console.error('Failed to import mappings:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to import mappings' },
      { status: 500 }
    )
  }
}
