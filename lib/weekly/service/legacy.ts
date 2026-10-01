import { prisma } from '@/lib/db'
import { isWeeklyEnabled } from '../flag'

export const WEEKLY_PERIOD_MESSAGE = 'This quarter uses weekly evaluations. Answer your questions on the Weekly evaluations page.'

/** The classic questionnaire is closed for a period that runs on weekly evaluations, unless HR has reopened it (spec 13.3). */
export async function weeklyCycleIdForPeriod(periodId: string): Promise<string | null> {
  if (!isWeeklyEnabled()) return null
  const cycle = await prisma.weeklyCycle.findUnique({ where: { periodId }, select: { id: true } })
  return cycle?.id ?? null
}
