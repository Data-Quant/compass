import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { parseCsvCategorySet, toSeededWeightProfiles } from '@/lib/weight-profiles'

/**
 * POST - Import compiled CSV data and seed weight profiles
 * 
 * This endpoint:
 * 1. Seeds the standard weight profiles
 * 2. Creates/updates employees from the CSV
 * 3. Creates evaluator mappings based on each employee's category set
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { action, employees } = await request.json()

    // Action 1: Seed weight profiles only
    if (action === 'seed-profiles') {
      const results = []

      for (const profile of toSeededWeightProfiles()) {
        const saved = await prisma.weightProfile.upsert({
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
        results.push(saved)
      }

      return NextResponse.json({
        success: true,
        message: `Seeded ${results.length} weight profiles`,
        profiles: results,
      })
    }

    // Action 2: Import employees with their category sets
    if (action === 'import-employees' && employees) {
      let created = 0
      let updated = 0
      let mappingsCreated = 0

      // First, find C-Level evaluator (Hamiz)
      const hamiz = await prisma.user.findFirst({
        where: { name: { contains: 'Hamiz', mode: 'insensitive' } },
      })

      for (const emp of employees) {
        const { name, designation, department, categorySet } = emp

        if (!name || !categorySet) continue

        // Create or update the employee
        let employee = await prisma.user.findFirst({
          where: { name: { equals: name, mode: 'insensitive' } },
        })

        if (employee) {
          await prisma.user.update({
            where: { id: employee.id },
            data: {
              position: designation || employee.position,
              department: department || employee.department,
            },
          })
          updated++
        } else {
          employee = await prisma.user.create({
            data: {
              name,
              position: designation || null,
              department: department || null,
              role: 'EMPLOYEE',
            },
          })
          created++
        }

        // Parse category set and create DEPT mapping (from Hamiz)
        const types = parseCsvCategorySet(categorySet)

        // Create a DEPT mapping if DEPT is in their category set and Hamiz exists
        if (types.includes('DEPT') && hamiz && hamiz.id !== employee.id) {
          try {
            await prisma.evaluatorMapping.upsert({
              where: {
                evaluatorId_evaluateeId_relationshipType: {
                  evaluatorId: hamiz.id,
                  evaluateeId: employee.id,
                  relationshipType: 'DEPT',
                },
              },
              update: {},
              create: {
                evaluatorId: hamiz.id,
                evaluateeId: employee.id,
                relationshipType: 'DEPT',
              },
            })
            mappingsCreated++
          } catch {
            // Mapping might already exist
          }
        }
      }

      return NextResponse.json({
        success: true,
        message: `Created ${created} employees, updated ${updated}, created ${mappingsCreated} DEPT mappings`,
      })
    }

    // Action 3: Seed DEPT evaluation questions
    if (action === 'seed-dept-questions') {
      const deptQuestions = [
        'How would you rate this department\'s overall performance and output quality?',
        'How effectively does this department collaborate with other teams?',
        'How well does this department manage priorities and meet deadlines?',
        'Rate the department\'s ability to innovate and adapt to changing business needs.',
        'How well does this department contribute to the company\'s strategic goals?',
      ]

      let created = 0
      for (let i = 0; i < deptQuestions.length; i++) {
        const existing = await prisma.evaluationQuestion.findFirst({
          where: {
            relationshipType: 'DEPT',
            orderIndex: i + 1,
          },
        })
        if (!existing) {
          await prisma.evaluationQuestion.create({
            data: {
              relationshipType: 'DEPT',
              questionText: deptQuestions[i],
              questionType: 'RATING',
              maxRating: 4,
              orderIndex: i + 1,
            },
          })
          created++
        }
      }

      return NextResponse.json({
        success: true,
        message: `Created ${created} DEPT evaluation questions`,
      })
    }

    return NextResponse.json({ error: 'Invalid action. Use "seed-profiles", "import-employees", or "seed-dept-questions"' }, { status: 400 })
  } catch (error) {
    console.error('Import compiled error:', error)
    return NextResponse.json({ error: 'Import failed' }, { status: 500 })
  }
}

