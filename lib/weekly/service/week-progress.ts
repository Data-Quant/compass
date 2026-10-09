// One count of "this week", shared by the dashboard card and the weekly page so they always agree: this week's
// performance questions plus any carried over from earlier weeks (still open, or dealt with this week).
import { prisma } from '@/lib/db'

export interface WeekProgress { done: number; total: number; carried: number; open: number }

export async function weekProgress(cycleId: string, evaluatorId: string, week: number, weekStart: Date): Promise<WeekProgress> {
  const prompts = await prisma.weeklyPrompt.findMany({
    where: { cycleId, evaluatorId, kind: 'STANDARD', weekIndex: { lte: week }, status: { notIn: ['CANCELLED', 'EXPIRED'] } },
    select: { weekIndex: true, status: true, updatedAt: true, response: { select: { submittedAt: true } } },
  })
  const isOpen = (p: { status: string }) => p.status === 'OPEN' || p.status === 'DRAFT'
  // When it was dealt with: the answer's time, or the status change for "not observed".
  const handledAt = (p: (typeof prompts)[number]) => p.response?.submittedAt ?? p.updatedAt
  const current = prompts.filter((p) => p.weekIndex === week)
  const carried = prompts.filter((p) => p.weekIndex < week && (isOpen(p) || handledAt(p) >= weekStart))
  const all = [...current, ...carried]
  return { total: all.length, done: all.filter((p) => !isOpen(p)).length, carried: carried.length, open: all.filter(isOpen).length }
}
