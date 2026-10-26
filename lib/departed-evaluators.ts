import { prisma } from '@/lib/db'

/**
 * People who have left (deactivated, or past their exit date). Their evaluator mappings stay, so past quarters keep
 * their history, but they can no longer submit an evaluation: completion does not wait on them.
 */
export async function departedUserIds(now: Date = new Date()): Promise<Set<string>> {
  const rows = await prisma.payrollEmployeeProfile.findMany({
    where: { OR: [{ isPayrollActive: false }, { exitDate: { lte: now } }] },
    select: { userId: true },
  })
  return new Set(rows.map((row) => row.userId))
}
