import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function removeSelfEvals() {
  console.log('Removing self-evaluation mappings...')
  
  const deleted = await prisma.evaluatorMapping.deleteMany({
    where: { relationshipType: 'SELF' }
  })
  console.log(`Deleted ${deleted.count} self-evaluation mappings`)
  
  const remaining = await prisma.evaluatorMapping.count()
  console.log(`Remaining mappings: ${remaining}`)
  
  // Show breakdown by type
  const breakdown = await prisma.evaluatorMapping.groupBy({
    by: ['relationshipType'],
    _count: true,
  })
  console.log('\nMappings by type:')
  breakdown.forEach(b => console.log(`  ${b.relationshipType}: ${b._count}`))
  
  await prisma.$disconnect()
}

removeSelfEvals()
