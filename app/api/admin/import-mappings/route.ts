import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { C_LEVEL_EVALUATORS, HR_EVALUATORS } from '@/lib/config'

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

// Helper to normalize names for comparison
function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
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
    if (!user || user.role !== 'HR') {
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

    for (const row of rows) {
      if (!row.Name || row.Name.trim() === '') continue

      const name = row.Name.trim()
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
        }
      }
    }

    // Helper to create a mapping
    async function createMapping(
      evaluatorName: string,
      evaluateeId: string,
      relationshipType: string
    ): Promise<boolean> {
      const evaluatorNormalized = normalizeName(evaluatorName)
      const evaluatorId = userMap.get(evaluatorNormalized)

      if (!evaluatorId) {
        // Try to find user in database
        const evaluator = await prisma.user.findFirst({
          where: { name: { contains: evaluatorName.trim(), mode: 'insensitive' } },
        })
        if (!evaluator) {
          result.errors.push(`Evaluator not found: ${evaluatorName}`)
          return false
        }
        userMap.set(evaluatorNormalized, evaluator.id)
        return createMapping(evaluatorName, evaluateeId, relationshipType)
      }

      // Check if mapping already exists
      const existing = await prisma.evaluatorMapping.findFirst({
        where: {
          evaluatorId,
          evaluateeId,
          relationshipType: relationshipType as any,
        },
      })

      if (existing) {
        result.mappingsSkipped++
        return false
      }

      await prisma.evaluatorMapping.create({
        data: {
          evaluatorId,
          evaluateeId,
          relationshipType: relationshipType as any,
        },
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
    })

    for (const hrName of HR_EVALUATORS) {
      const hrNormalized = normalizeName(hrName)
      const hrId = userMap.get(hrNormalized)

      if (!hrId) {
        result.errors.push(`HR evaluator not found: ${hrName}`)
        continue
      }

      for (const employee of allEmployees) {
        // HR doesn't evaluate themselves
        if (employee.id !== hrId) {
          await createMapping(hrName, employee.id, 'HR')
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
