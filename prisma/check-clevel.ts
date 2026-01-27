import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function checkCLevel() {
  // Find all C_LEVEL mappings
  const cLevelMappings = await prisma.evaluatorMapping.findMany({
    where: { relationshipType: 'C_LEVEL' },
    include: {
      evaluator: { select: { name: true } },
      evaluatee: { select: { name: true } },
    },
  })

  console.log('C-Level Mappings:')
  cLevelMappings.forEach(m => {
    console.log(`  ${m.evaluator.name} evaluates ${m.evaluatee.name}`)
  })

  // Find all mappings where Hamiz, Brad, or Daniyal are evaluators
  const cLevelEvaluators = ['Hamiz Awan', 'Brad Herman', 'Daniyal Awan']
  
  for (const name of cLevelEvaluators) {
    const user = await prisma.user.findFirst({
      where: { name: { contains: name, mode: 'insensitive' } }
    })
    
    if (user) {
      const mappings = await prisma.evaluatorMapping.findMany({
        where: { evaluatorId: user.id },
        include: { evaluatee: { select: { name: true } } }
      })
      console.log(`\n${name} (${user.id}) evaluates ${mappings.length} people:`)
      mappings.forEach(m => console.log(`  - ${m.evaluatee.name} as ${m.relationshipType}`))
    } else {
      console.log(`\n${name} - NOT FOUND IN DATABASE`)
    }
  }

  await prisma.$disconnect()
}

checkCLevel()
