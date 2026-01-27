import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

// Missing users from the org chart images
const missingUsers = [
  { name: 'Richard Reizes', position: 'Partner', department: 'Executive', role: 'EMPLOYEE' },
  { name: 'Maryam Khalil', position: 'Lead', department: '1to1Plans', role: 'EMPLOYEE' },
  { name: 'Zhoyia Malik', position: 'Senior Associate', department: 'IR', role: 'EMPLOYEE' },
  { name: 'Armin Qayyum', position: 'Associate', department: 'IR', role: 'EMPLOYEE' },
  { name: 'Aamir Shaikh', position: 'Principal', department: 'Software Engineering', role: 'EMPLOYEE' },
  { name: 'Faizan Jabbar', position: 'Analyst', department: 'Quantitative Engineering', role: 'EMPLOYEE' },
  { name: 'Umair Asmat', position: 'Analyst', department: 'Quantitative Engineering', role: 'EMPLOYEE' },
  { name: 'Fakayha Jamil', position: 'Associate', department: 'Product', role: 'EMPLOYEE' },
]

async function addMissingUsers() {
  console.log('Adding missing users from org chart...\n')

  for (const userData of missingUsers) {
    // Check if user already exists
    const existing = await prisma.user.findFirst({
      where: { name: { equals: userData.name, mode: 'insensitive' } }
    })

    if (existing) {
      console.log(`Already exists: ${userData.name}`)
      // Update their info if needed
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          position: userData.position,
          department: userData.department,
        }
      })
    } else {
      await prisma.user.create({
        data: {
          name: userData.name,
          position: userData.position,
          department: userData.department,
          role: userData.role as any,
        }
      })
      console.log(`Created: ${userData.name} (${userData.position}, ${userData.department})`)
    }
  }

  // Add Richard Reizes to C-Level evaluators
  const richard = await prisma.user.findFirst({
    where: { name: { contains: 'Richard', mode: 'insensitive' } }
  })

  if (richard) {
    console.log('\nRichard Reizes is a Partner - consider adding him to C_LEVEL_EVALUATORS in config.ts')
  }

  // Show total users
  const total = await prisma.user.count()
  console.log(`\nTotal users: ${total}`)

  await prisma.$disconnect()
}

addMissingUsers()
