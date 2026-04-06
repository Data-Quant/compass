import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { C_LEVEL_EVALUATORS, HR_EVALUATORS } from '@/lib/config'
import type { RelationshipType } from '@/types'
import {
  createLogicalEvaluatorMapping,
  shouldSkipMappingParticipants,
} from '@/lib/evaluation-mappings'

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
  errors: string[]
}

const USER_NAME_ALIASES: Record<string, string> = {
  'nohelia figuerdo': 'Nohelia Figueredo',
  'umair asmat': 'Omair Asmat',
}

// Helper to normalize names for comparison
function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

function resolveImportedName(name: string): string {
  const normalized = normalizeName(name)
  return USER_NAME_ALIASES[normalized] || name.trim()
}

// Helper to check if a name matches C-Level evaluators
function isCLevelEvaluator(name: string): boolean {
  const normalized = normalizeName(name)
  return C_LEVEL_EVALUATORS.some(cl => normalizeName(cl) === normalized)
}

// Helper to check if a name matches HR evaluators
function isHREvaluator(name: string): boolean {
  const normalized = normalizeName(name)
  return HR_EVALUATORS.some(hr => normalizeName(hr) === normalized)
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { rows, clearExisting } = await request.json() as { 
      rows: CSVRow[]
      clearExisting: boolean 
    }

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

    // Clear existing mappings if requested
    if (clearExisting) {
      await prisma.evaluatorMapping.deleteMany({})
    }

    // First pass: Create/update all users from the CSV
    const userMap = new Map<string, string>() // normalized name -> user id
    const userDetailsById = new Map<string, { department: string | null }>()

    for (const row of rows) {
      if (!row.Name || row.Name.trim() === '') continue

      const name = resolveImportedName(row.Name)
      const normalizedName = normalizeName(name)
      const designation = row.Designation?.trim() || null
      const department = row.Department?.trim() || null

      try {
        // Try to find existing user
        let existingUser = await prisma.user.findFirst({
          where: {
            name: { equals: name, mode: 'insensitive' },
          },
        })

        if (existingUser) {
          // Update user if designation/department changed
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
            department: department ?? existingUser.department,
          })
        } else {
          // Create new user
          const newUser = await prisma.user.create({
            data: {
              name,
              position: designation,
              department,
              role: isHREvaluator(name) ? 'HR' : 'EMPLOYEE',
            },
          })
          result.usersCreated++
          userMap.set(normalizedName, newUser.id)
          userDetailsById.set(newUser.id, {
            department: newUser.department,
          })
        }
      } catch (error) {
        console.error(`Error processing user ${name}:`, error)
        result.errors.push(`Error processing user ${name}`)
      }
    }

    // Also ensure all C-Level and HR evaluators exist
    for (const clName of C_LEVEL_EVALUATORS) {
      const normalized = normalizeName(clName)
      if (!userMap.has(normalized)) {
        let existing = await prisma.user.findFirst({
          where: { name: { equals: clName, mode: 'insensitive' } },
        })
        if (existing) {
          userMap.set(normalized, existing.id)
          userDetailsById.set(existing.id, {
            department: existing.department,
          })
        }
      }
    }

    for (const hrName of HR_EVALUATORS) {
      const normalized = normalizeName(hrName)
      if (!userMap.has(normalized)) {
        let existing = await prisma.user.findFirst({
          where: { name: { equals: hrName, mode: 'insensitive' } },
        })
        if (existing) {
          userMap.set(normalized, existing.id)
          userDetailsById.set(existing.id, {
            department: existing.department,
          })
        }
      }
    }

    // Helper to create a mapping
    async function createMapping(
      evaluatorName: string,
      evaluateeId: string,
      relationshipType: string
    ): Promise<boolean> {
      const resolvedEvaluatorName = resolveImportedName(evaluatorName)
      const evaluatorNormalized = normalizeName(resolvedEvaluatorName)
      const evaluatorId = userMap.get(evaluatorNormalized)

      if (!evaluatorId) {
        // Try to find user in database before creating a placeholder.
        const evaluator = await prisma.user.findFirst({
          where: { name: { contains: resolvedEvaluatorName, mode: 'insensitive' } },
        })

        if (evaluator) {
          userMap.set(evaluatorNormalized, evaluator.id)
          userDetailsById.set(evaluator.id, {
            department: evaluator.department,
          })
          return createMapping(resolvedEvaluatorName, evaluateeId, relationshipType)
        }

        const createdEvaluator = await prisma.user.create({
          data: {
            name: resolvedEvaluatorName,
            role: isHREvaluator(resolvedEvaluatorName) ? 'HR' : 'EMPLOYEE',
            department: isCLevelEvaluator(resolvedEvaluatorName) ? 'Executive' : null,
            position: isCLevelEvaluator(resolvedEvaluatorName) ? 'C-Level Executive' : null,
          },
        })

        result.usersCreated++
        userMap.set(evaluatorNormalized, createdEvaluator.id)
        userDetailsById.set(createdEvaluator.id, {
          department: createdEvaluator.department,
        })
        return createMapping(resolvedEvaluatorName, evaluateeId, relationshipType)
      }

      const evaluator = userDetailsById.get(evaluatorId)
      const evaluatee = userDetailsById.get(evaluateeId)

      if (shouldSkipMappingParticipants([evaluator, evaluatee])) {
        result.mappingsSkipped++
        return false
      }

      await createLogicalEvaluatorMapping(prisma, {
        evaluatorId,
        evaluateeId,
        relationshipType: relationshipType as RelationshipType,
      })
      result.mappingsCreated++
      return true
    }

    // Second pass: Create mappings from CSV columns
    for (const row of rows) {
      if (!row.Name || row.Name.trim() === '') continue

      const evaluateeName = row.Name.trim()
      const evaluateeNormalized = normalizeName(evaluateeName)
      const evaluateeId = userMap.get(evaluateeNormalized)

      if (!evaluateeId) {
        result.errors.push(`Evaluatee not found in user map: ${evaluateeName}`)
        continue
      }

      // Process Team Lead columns (Team Lead 1, Team Lead 2, etc.)
      for (let i = 1; i <= 5; i++) {
        const teamLeadName = row[`Team Lead ${i}`]?.trim()
        if (teamLeadName && teamLeadName !== '') {
          // Check if this team lead is actually a C-Level evaluator
          if (isCLevelEvaluator(teamLeadName)) {
            await createMapping(teamLeadName, evaluateeId, 'C_LEVEL')
          } else {
            await createMapping(teamLeadName, evaluateeId, 'TEAM_LEAD')
          }
        }
      }

      // Process Peer columns (various formats in CSV)
      const peerColumns = [
        'Team Member/Peer 1', 'Team Member/Peer  2', 'Team Member/Peer  3', 
        'Team Member/Peer  4', 'Team Member/ Peer 5', 'Team Member/ Peer 6',
        'Team Member/ Peer 7', 'Team Member/ Peer 8'
      ]
      for (const col of peerColumns) {
        const peerName = row[col]?.trim()
        if (peerName && peerName !== '') {
          await createMapping(peerName, evaluateeId, 'PEER')
        }
      }

      // Process Reporting Team Member columns
      for (let i = 1; i <= 11; i++) {
        const rtmName = row[`Reporting Team Member ${i}`]?.trim()
        if (rtmName && rtmName !== '') {
          await createMapping(rtmName, evaluateeId, 'DIRECT_REPORT')
        }
      }
      
      // Note: Self-evaluations are not created - they are not part of the scoring
    }

    // Third pass: HR evaluators evaluate ALL employees
    const allEmployees = await prisma.user.findMany({
      where: { role: 'EMPLOYEE' },
      select: {
        id: true,
        department: true,
      },
    })

    for (const hrName of HR_EVALUATORS) {
      const hrNormalized = normalizeName(hrName)
      const hrId = userMap.get(hrNormalized)

      if (!hrId) {
        result.errors.push(`HR evaluator not found: ${hrName}`)
        continue
      }

      for (const employee of allEmployees) {
        userDetailsById.set(employee.id, {
          department: employee.department,
        })

        // HR doesn't evaluate themselves
        if (employee.id !== hrId) {
          await createMapping(hrName, employee.id, 'HR')
        }
      }
    }

    // Fourth pass: Create DEPT mappings (Hamiz evaluates departments)
    // Find Hamiz user for DEPT evaluations
    const hamizName = C_LEVEL_EVALUATORS.find(n => normalizeName(n).includes('hamiz'))
    if (hamizName) {
      const hamizNormalized = normalizeName(hamizName)
      const hamizId = userMap.get(hamizNormalized)

      if (hamizId) {
        for (const row of rows) {
          if (!row.Name || row.Name.trim() === '') continue
          
          // Check if this employee has a Dept score in the CSV
          const deptScore = row['Dept']?.trim()
          if (deptScore && deptScore !== '' && !isNaN(parseFloat(deptScore))) {
            const evaluateeNormalized = normalizeName(row.Name.trim())
            const evaluateeId = userMap.get(evaluateeNormalized)
            
            if (evaluateeId && evaluateeId !== hamizId) {
              await createMapping(hamizName, evaluateeId, 'DEPT')
            }
          }
        }
      }
    }

    return NextResponse.json({ success: true, result })
  } catch (error) {
    console.error('Failed to import mappings:', error)
    return NextResponse.json(
      { error: 'Failed to import mappings' },
      { status: 500 }
    )
  }
}

