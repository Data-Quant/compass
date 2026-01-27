import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

// POST - Import users or mappings from CSV data
export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || user.role !== 'HR') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { type, data } = await request.json()

    if (!type || !Array.isArray(data) || data.length === 0) {
      return NextResponse.json(
        { error: 'Type and data array are required' },
        { status: 400 }
      )
    }

    if (type === 'users') {
      return await importUsers(data)
    } else if (type === 'mappings') {
      return await importMappings(data)
    } else {
      return NextResponse.json({ error: 'Invalid import type' }, { status: 400 })
    }
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Import failed' },
      { status: 500 }
    )
  }
}

async function importUsers(data: any[]) {
  const results = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [] as string[],
  }

  for (let i = 0; i < data.length; i++) {
    const row = data[i]
    const rowNum = i + 2 // Account for header row and 0-index

    try {
      const name = row.name || row.Name || row.NAME
      const email = row.email || row.Email || row.EMAIL
      const department = row.department || row.Department || row.DEPARTMENT
      const position = row.position || row.Position || row.POSITION || row.title || row.Title
      const role = (row.role || row.Role || row.ROLE || 'EMPLOYEE').toUpperCase()

      if (!name) {
        results.errors.push(`Row ${rowNum}: Name is required`)
        continue
      }

      // Check if user exists by email
      if (email) {
        const existingByEmail = await prisma.user.findFirst({
          where: { email: { equals: email, mode: 'insensitive' } },
        })

        if (existingByEmail) {
          // Update existing user
          await prisma.user.update({
            where: { id: existingByEmail.id },
            data: {
              name,
              department: department || null,
              position: position || null,
              role: role === 'HR' ? 'HR' : 'EMPLOYEE',
            },
          })
          results.updated++
          continue
        }
      }

      // Check if user exists by exact name
      const existingByName = await prisma.user.findFirst({
        where: { name: { equals: name, mode: 'insensitive' } },
      })

      if (existingByName) {
        // Update existing user
        await prisma.user.update({
          where: { id: existingByName.id },
          data: {
            email: email || existingByName.email,
            department: department || existingByName.department,
            position: position || existingByName.position,
            role: role === 'HR' ? 'HR' : 'EMPLOYEE',
          },
        })
        results.updated++
        continue
      }

      // Create new user
      await prisma.user.create({
        data: {
          name,
          email: email || null,
          department: department || null,
          position: position || null,
          role: role === 'HR' ? 'HR' : 'EMPLOYEE',
        },
      })
      results.created++
    } catch (error: any) {
      if (error.code === 'P2002') {
        results.errors.push(`Row ${rowNum}: Duplicate email`)
      } else {
        results.errors.push(`Row ${rowNum}: ${error.message}`)
      }
    }
  }

  return NextResponse.json({ success: true, results })
}

async function importMappings(data: any[]) {
  const results = {
    created: 0,
    skipped: 0,
    errors: [] as string[],
  }

  for (let i = 0; i < data.length; i++) {
    const row = data[i]
    const rowNum = i + 2

    try {
      const evaluatorName = row.evaluator || row.Evaluator || row.evaluator_name || row.EVALUATOR
      const evaluatorEmail = row.evaluator_email || row.evaluatorEmail
      const evaluateeName = row.evaluatee || row.Evaluatee || row.evaluatee_name || row.EVALUATEE
      const evaluateeEmail = row.evaluatee_email || row.evaluateeEmail
      const relationshipType = (row.relationship || row.Relationship || row.relationship_type || row.type || row.Type || '').toUpperCase().replace(/\s+/g, '_')

      // Normalize relationship type
      const typeMap: Record<string, string> = {
        'DIRECT_REPORT': 'DIRECT_REPORT',
        'DIRECTREPORT': 'DIRECT_REPORT',
        'DIRECT': 'DIRECT_REPORT',
        'TEAM_LEAD': 'TEAM_LEAD',
        'TEAMLEAD': 'TEAM_LEAD',
        'LEAD': 'TEAM_LEAD',
        'MANAGER': 'TEAM_LEAD',
        'PEER': 'PEER',
        'C_LEVEL': 'C_LEVEL',
        'CLEVEL': 'C_LEVEL',
        'CEO': 'C_LEVEL',
        'EXECUTIVE': 'C_LEVEL',
        'HR': 'HR',
      }

      const normalizedType = typeMap[relationshipType]

      if (!normalizedType) {
        results.errors.push(`Row ${rowNum}: Invalid relationship type "${relationshipType}"`)
        continue
      }

      // Find evaluator
      const evaluator = await prisma.user.findFirst({
        where: {
          OR: [
            evaluatorName ? { name: { contains: evaluatorName, mode: 'insensitive' } } : {},
            evaluatorEmail ? { email: { equals: evaluatorEmail, mode: 'insensitive' } } : {},
          ].filter(condition => Object.keys(condition).length > 0),
        },
      })

      if (!evaluator) {
        results.errors.push(`Row ${rowNum}: Evaluator not found "${evaluatorName || evaluatorEmail}"`)
        continue
      }

      // Find evaluatee
      const evaluatee = await prisma.user.findFirst({
        where: {
          OR: [
            evaluateeName ? { name: { contains: evaluateeName, mode: 'insensitive' } } : {},
            evaluateeEmail ? { email: { equals: evaluateeEmail, mode: 'insensitive' } } : {},
          ].filter(condition => Object.keys(condition).length > 0),
        },
      })

      if (!evaluatee) {
        results.errors.push(`Row ${rowNum}: Evaluatee not found "${evaluateeName || evaluateeEmail}"`)
        continue
      }

      // Check if mapping already exists
      const existing = await prisma.evaluatorMapping.findFirst({
        where: {
          evaluatorId: evaluator.id,
          evaluateeId: evaluatee.id,
          relationshipType: normalizedType as any,
        },
      })

      if (existing) {
        results.skipped++
        continue
      }

      // Create mapping
      await prisma.evaluatorMapping.create({
        data: {
          evaluatorId: evaluator.id,
          evaluateeId: evaluatee.id,
          relationshipType: normalizedType as any,
        },
      })
      results.created++
    } catch (error: any) {
      results.errors.push(`Row ${rowNum}: ${error.message}`)
    }
  }

  return NextResponse.json({ success: true, results })
}
