// Loads the facts the §5 last-resort self-review rule needs and enforces it.
import type { Prisma } from '@prisma/client'
import type { SecurityActor } from '../access'
import { DAY_MS, karachiDateKey, startOfKarachiDateKey } from '../dates'
import { selfReviewDecision, type PeerAdmin } from '../self-review'
import { isActiveEmployee } from './directory'
import { forbidden, SecurityChecksError } from './errors'

export interface SelfReviewOutcome {
  selfReview: boolean
  justification: string | null
}

async function loadPeers(tx: Prisma.TransactionClient, actorId: string, now: Date): Promise<PeerAdmin[]> {
  const admins = await tx.user.findMany({
    where: { role: 'SECURITY', id: { not: actorId } },
    select: { id: true, name: true, payrollProfile: { select: { isPayrollActive: true, exitDate: true } } },
  })
  if (admins.length === 0) return []
  const dayStart = startOfKarachiDateKey(karachiDateKey(now)) ?? now
  const dayEnd = new Date(dayStart.getTime() + DAY_MS - 1)
  return Promise.all(
    admins.map(async (admin) => {
      const [leave, lastAction, oldestWaiting] = await Promise.all([
        tx.leaveRequest.findFirst({
          where: { employeeId: admin.id, status: 'APPROVED', startDate: { lte: dayEnd }, endDate: { gte: dayStart } },
          select: { id: true },
        }),
        tx.securityReviewAction.findFirst({ where: { reviewerId: admin.id }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
        tx.securityTask.findFirst({
          where: { status: 'PENDING_REVIEW', userId: { not: admin.id } },
          orderBy: { lastSubmittedAt: 'asc' },
          select: { lastSubmittedAt: true },
        }),
      ])
      return {
        id: admin.id,
        name: admin.name,
        active: isActiveEmployee(admin.payrollProfile, now),
        onLeave: leave !== null,
        lastReviewActionAt: lastAction?.createdAt ?? null,
        oldestWaitingSince: oldestWaiting?.lastSubmittedAt ?? null,
      }
    }),
  )
}

/**
 * Returns whether this is a (permitted) self-review. Throws when an admin acts
 * on their own task while another Security Admin is available, or without a
 * written justification.
 */
export async function resolveSelfReview(
  tx: Prisma.TransactionClient,
  actor: SecurityActor,
  subjectUserId: string,
  justification: string | undefined,
  now: Date,
): Promise<SelfReviewOutcome> {
  if (actor.id !== subjectUserId) return { selfReview: false, justification: null }
  const decision = selfReviewDecision(actor.id, subjectUserId, await loadPeers(tx, actor.id, now), now)
  if (!decision.selfReview) return { selfReview: false, justification: null }
  if (!decision.allowed) throw forbidden(decision.error)
  if (!justification) throw new SecurityChecksError('Self-review is a last resort: write a justification to continue', 400)
  return { selfReview: true, justification }
}
