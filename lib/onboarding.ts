import { prisma } from '@/lib/db'

export const DEFAULT_ONBOARDING_MODULES: Array<{ slug: string; title: string }> = [
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

export function isPlutusEmail(email: string): boolean {
  return /@plutus21\.com$/i.test(email.trim())
}

export async function initializeOnboardingProgressForUser(userId: string) {
  const existing = await prisma.onboardingProgress.count({
    where: { userId },
  })
  if (existing > 0) {
    return
  }

  const modules = await prisma.onboardingModule.findMany({
    where: { isActive: true },
    orderBy: { orderIndex: 'asc' },
  })

  if (modules.length === 0) {
    return
  }

  const now = new Date()
  await prisma.onboardingProgress.createMany({
    data: modules.map((module, index) => ({
      userId,
      moduleId: module.id,
      status: index === 0 ? 'IN_PROGRESS' : 'LOCKED',
      startedAt: index === 0 ? now : null,
      completedAt: null,
    })),
  })
}

export async function hasCompletedAllModules(userId: string) {
  const [totalModules, completedModules] = await Promise.all([
    prisma.onboardingModule.count({ where: { isActive: true } }),
    prisma.onboardingProgress.count({
      where: {
        userId,
        module: { isActive: true },
        status: 'COMPLETED',
      },
    }),
  ])
  return totalModules > 0 && completedModules === totalModules
}

export async function getOnboardingAttemptStats(userId: string) {
  const [attemptCount, latestAttempt] = await Promise.all([
    prisma.quizAttempt.count({ where: { userId } }),
    prisma.quizAttempt.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    }),
  ])
  return { attemptCount, latestAttempt }
}
