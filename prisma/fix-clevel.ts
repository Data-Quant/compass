import { PrismaClient } from '@prisma/client'
import * as fs from 'fs'
import Papa from 'papaparse'

const prisma = new PrismaClient()

const C_LEVEL_EVALUATORS = ['Hamiz Awan', 'Brad Herman', 'Daniyal Awan']

async function fixCLevel() {
  console.log('Fixing C-Level evaluators...\n')

  // 1. Create Hamiz Awan and Daniyal Awan if they don't exist
  for (const name of ['Hamiz Awan', 'Daniyal Awan']) {
    let user = await prisma.user.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } }
    })
    
    if (!user) {
      user = await prisma.user.create({
        data: {
          name,
          department: 'Executive',
          position: 'C-Level Executive',
          role: 'EMPLOYEE',
        }
      })
      console.log(`Created user: ${name}`)
    } else {
      console.log(`User exists: ${name}`)
    }
  }

  // 2. Read the CSV to find who has C-Level evaluators as their Team Leads
  const csvPath = './Performance Evaluation Q4 2025 - Your Evaluators.csv'
  const csvContent = fs.readFileSync(csvPath, 'utf-8')
  const parsed = Papa.parse(csvContent, { header: true, skipEmptyLines: true })
  const rows = parsed.data as any[]

  // 3. For each row, check if any Team Lead is a C-Level evaluator
  for (const row of rows) {
    if (!row.Name || row.Name.trim() === '') continue
    
    const evaluateeName = row.Name.trim()
    const evaluatee = await prisma.user.findFirst({
      where: { name: { equals: evaluateeName, mode: 'insensitive' } }
    })
    
    if (!evaluatee) {
      console.log(`Evaluatee not found: ${evaluateeName}`)
      continue
    }

    // Check Team Lead columns
    for (let i = 1; i <= 5; i++) {
      const teamLeadName = row[`Team Lead ${i}`]?.trim()
      if (!teamLeadName) continue

      // Is this Team Lead a C-Level evaluator?
      const isCLevel = C_LEVEL_EVALUATORS.some(
        cl => cl.toLowerCase() === teamLeadName.toLowerCase()
      )

      if (isCLevel) {
        const evaluator = await prisma.user.findFirst({
          where: { name: { equals: teamLeadName, mode: 'insensitive' } }
        })

        if (!evaluator) {
          console.log(`C-Level evaluator not found: ${teamLeadName}`)
          continue
        }

        // Check if C_LEVEL mapping exists
        const existingCLevel = await prisma.evaluatorMapping.findFirst({
          where: {
            evaluatorId: evaluator.id,
            evaluateeId: evaluatee.id,
            relationshipType: 'C_LEVEL',
          }
        })

        if (!existingCLevel) {
          // Create C_LEVEL mapping
          await prisma.evaluatorMapping.create({
            data: {
              evaluatorId: evaluator.id,
              evaluateeId: evaluatee.id,
              relationshipType: 'C_LEVEL',
            }
          })
          console.log(`Created C_LEVEL: ${teamLeadName} -> ${evaluateeName}`)
        }

        // Also check if there's a TEAM_LEAD mapping that should be removed
        const existingTeamLead = await prisma.evaluatorMapping.findFirst({
          where: {
            evaluatorId: evaluator.id,
            evaluateeId: evaluatee.id,
            relationshipType: 'TEAM_LEAD',
          }
        })

        if (existingTeamLead) {
          await prisma.evaluatorMapping.delete({
            where: { id: existingTeamLead.id }
          })
          console.log(`Removed TEAM_LEAD (now C_LEVEL): ${teamLeadName} -> ${evaluateeName}`)
        }
      }
    }
  }

  // 4. Show final C-Level counts
  const cLevelMappings = await prisma.evaluatorMapping.findMany({
    where: { relationshipType: 'C_LEVEL' },
    include: {
      evaluator: { select: { name: true } },
      evaluatee: { select: { name: true } },
    }
  })

  console.log(`\nFinal C-Level Mappings (${cLevelMappings.length}):`)
  cLevelMappings.forEach(m => {
    console.log(`  ${m.evaluator.name} evaluates ${m.evaluatee.name}`)
  })

  // Show breakdown
  const breakdown = await prisma.evaluatorMapping.groupBy({
    by: ['relationshipType'],
    _count: true,
  })
  console.log('\nMappings by type:')
  breakdown.forEach(b => console.log(`  ${b.relationshipType}: ${b._count}`))

  await prisma.$disconnect()
}

fixCLevel()
