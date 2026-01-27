import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function cleanup() {
  console.log('Cleaning up dummy users...')

  // Delete users with @example.com emails (these are the seed dummy users)
  const dummyUsers = await prisma.user.findMany({
    where: {
      email: {
        contains: '@example.com',
      },
    },
  })

  console.log(`Found ${dummyUsers.length} dummy users to delete:`)
  dummyUsers.forEach(u => console.log(`  - ${u.name} (${u.email})`))

  if (dummyUsers.length > 0) {
    // Delete related records first (cascades should handle this, but being safe)
    const userIds = dummyUsers.map(u => u.id)

    // Delete mappings involving these users
    const deletedMappings = await prisma.evaluatorMapping.deleteMany({
      where: {
        OR: [
          { evaluatorId: { in: userIds } },
          { evaluateeId: { in: userIds } },
        ],
      },
    })
    console.log(`Deleted ${deletedMappings.count} mappings`)

    // Delete the dummy users
    const deletedUsers = await prisma.user.deleteMany({
      where: {
        id: { in: userIds },
      },
    })
    console.log(`Deleted ${deletedUsers.count} dummy users`)
  }

  console.log('\nRemaining users:')
  const remainingUsers = await prisma.user.findMany({
    orderBy: { name: 'asc' },
  })
  console.log(`Total: ${remainingUsers.length} users`)
  remainingUsers.slice(0, 10).forEach(u => console.log(`  - ${u.name} (${u.department || 'No dept'})`))
  if (remainingUsers.length > 10) {
    console.log(`  ... and ${remainingUsers.length - 10} more`)
  }

  console.log('\nCleanup completed!')
}

cleanup()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
