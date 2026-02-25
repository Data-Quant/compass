import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const DEFAULT_ONBOARDING_MODULES = [
  { slug: 'company-intro', title: 'Company Introduction' },
  { slug: 'team-intro', title: 'Team Introduction' },
  { slug: 'culture', title: 'Culture & Values' },
  { slug: 'policies', title: 'Policies' },
  { slug: 'benefits', title: 'Benefits Overview' },
  { slug: 'tools', title: 'Tools & Access' },
  { slug: 'important-calls', title: 'Important Calls' },
  { slug: 'discord-training', title: 'Discord Training' },
  { slug: 'compass-training', title: 'Compass Training' },
  { slug: 'buddy-intro', title: 'Buddy Introduction' },
  { slug: 'ending-note', title: 'Final Note' },
]

const DEFAULT_BENEFIT_CATEGORIES = [
  { region: 'Pakistan', employeeType: 'Plutus21 Employee' },
  { region: 'Pakistan', employeeType: 'Plutus21 IC' },
  { region: 'Morocco', employeeType: 'Plutus21 Employee' },
  { region: 'Morocco', employeeType: 'Plutus21 IC' },
  { region: 'Colombia', employeeType: 'Plutus21 Employee' },
  { region: 'Colombia', employeeType: 'Plutus21 IC' },
  { region: 'Indonesia', employeeType: 'Plutus21 Employee' },
  { region: 'Indonesia', employeeType: 'Plutus21 IC' },
]

function hasArg(flag: string) {
  return process.argv.includes(flag)
}

function formatModule(
  moduleData: { title: string; slug: string },
  index: number,
  usedOrderIndexes: Set<number>
) {
  let orderIndex = index + 1
  while (usedOrderIndexes.has(orderIndex)) {
    orderIndex += 1
  }
  usedOrderIndexes.add(orderIndex)
  return { ...moduleData, orderIndex }
}

async function seedOnboarding({ apply }: { apply: boolean }) {
  const existingModules = await prisma.onboardingModule.findMany({
    select: { id: true, slug: true, orderIndex: true, isActive: true },
  })
  const existingModuleSlugs = new Set(existingModules.map((module) => module.slug))
  const usedOrderIndexes = new Set(existingModules.map((module) => module.orderIndex))

  const modulesToCreate = DEFAULT_ONBOARDING_MODULES
    .filter((module) => !existingModuleSlugs.has(module.slug))
    .map((module, index) => formatModule(module, index, usedOrderIndexes))

  const existingCategories = await prisma.benefitCategory.findMany({
    select: { name: true },
  })
  const existingCategoryNames = new Set(existingCategories.map((category) => category.name))
  const categoriesToCreate = DEFAULT_BENEFIT_CATEGORIES
    .map((category) => ({
      name: `${category.region} - ${category.employeeType}`,
      region: category.region,
      employeeType: category.employeeType,
      isActive: true,
    }))
    .filter((category) => !existingCategoryNames.has(category.name))

  const existingConfig = await prisma.onboardingConfig.findUnique({
    where: { id: 'singleton' },
    select: { id: true },
  })

  const usersNeedingProgress = await prisma.user.findMany({
    where: {
      onboardingCompleted: false,
      onboardingProgress: { none: {} },
    },
    select: { id: true, email: true, name: true },
  })

  console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}`)
  console.log(`Modules existing: ${existingModules.length}`)
  console.log(`Modules to create: ${modulesToCreate.length}`)
  console.log(`Benefit categories to create: ${categoriesToCreate.length}`)
  console.log(`Onboarding config exists: ${existingConfig ? 'yes' : 'no'}`)
  console.log(`Users needing onboarding progress init: ${usersNeedingProgress.length}`)

  if (!apply) {
    if (modulesToCreate.length > 0) {
      console.log(
        `Will create modules: ${modulesToCreate
          .map((module) => `${module.orderIndex}:${module.slug}`)
          .join(', ')}`
      )
    }
    if (categoriesToCreate.length > 0) {
      console.log(
        `Will create categories: ${categoriesToCreate.map((category) => category.name).join(', ')}`
      )
    }
    if (usersNeedingProgress.length > 0) {
      console.log(
        `Will initialize progress for users: ${usersNeedingProgress
          .map((user) => user.email || user.name || user.id)
          .join(', ')}`
      )
    }
    console.log('No database changes were made. Re-run with --apply to execute.')
    return
  }

  for (const moduleData of modulesToCreate) {
    await prisma.onboardingModule.create({
      data: {
        slug: moduleData.slug,
        title: moduleData.title,
        orderIndex: moduleData.orderIndex,
        content: '',
        isActive: true,
      },
    })
  }

  for (const category of categoriesToCreate) {
    await prisma.benefitCategory.create({
      data: category,
    })
  }

  if (!existingConfig) {
    await prisma.onboardingConfig.create({
      data: {
        id: 'singleton',
        quizPassPercent: 80,
        maxQuizAttempts: 3,
        welcomeMessage: 'Welcome to Compass onboarding.',
      },
    })
  }

  const activeModules = await prisma.onboardingModule.findMany({
    where: { isActive: true },
    orderBy: { orderIndex: 'asc' },
    select: { id: true },
  })

  if (activeModules.length > 0) {
    for (const user of usersNeedingProgress) {
      const now = new Date()
      await prisma.onboardingProgress.createMany({
        data: activeModules.map((module, index) => ({
          userId: user.id,
          moduleId: module.id,
          status: index === 0 ? 'IN_PROGRESS' : 'LOCKED',
          startedAt: index === 0 ? now : null,
          completedAt: null,
        })),
      })
    }
  }

  const finalModuleCount = await prisma.onboardingModule.count()
  const finalCategoryCount = await prisma.benefitCategory.count()
  const finalConfigCount = await prisma.onboardingConfig.count()
  const finalProgressCount = await prisma.onboardingProgress.count()

  console.log('Onboarding seed apply complete.')
  console.log(`Onboarding modules total: ${finalModuleCount}`)
  console.log(`Benefit categories total: ${finalCategoryCount}`)
  console.log(`Onboarding config rows total: ${finalConfigCount}`)
  console.log(`Onboarding progress rows total: ${finalProgressCount}`)
}

async function main() {
  const apply = hasArg('--apply')
  await seedOnboarding({ apply })
}

main()
  .catch((error) => {
    console.error('Onboarding seed failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
