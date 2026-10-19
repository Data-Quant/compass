// §5 Last-resort self-review. A Security Admin may act on their own task
// (verdict, extension, exemption) only when every other Security Admin is
// unavailable: account deactivated, marked on leave in Compass, or no review
// action for 5 consecutive business days while reviewable items wait.
import { businessDaysBetween, laterOf } from './dates'

export const INACTIVE_REVIEWER_BUSINESS_DAYS = 5

export type UnavailableReason = 'DEACTIVATED' | 'ON_LEAVE' | 'NO_RECENT_REVIEWS'

export interface PeerAdmin {
  id: string
  name: string
  active: boolean
  onLeave: boolean
  lastReviewActionAt: Date | null
  /** Oldest submission this peer could review that is still waiting, or null. */
  oldestWaitingSince: Date | null
}

export function peerUnavailableReason(peer: PeerAdmin, now: Date): UnavailableReason | null {
  if (!peer.active) return 'DEACTIVATED'
  if (peer.onLeave) return 'ON_LEAVE'
  if (peer.oldestWaitingSince) {
    const quietSince = peer.lastReviewActionAt ? laterOf(peer.lastReviewActionAt, peer.oldestWaitingSince) : peer.oldestWaitingSince
    if (businessDaysBetween(quietSince, now) >= INACTIVE_REVIEWER_BUSINESS_DAYS) return 'NO_RECENT_REVIEWS'
  }
  return null
}

export type SelfReviewDecision =
  | { selfReview: false }
  | { selfReview: true; allowed: true; peerReasons: Array<{ id: string; name: string; reason: UnavailableReason }> }
  | { selfReview: true; allowed: false; error: string }

export function selfReviewDecision(
  actorId: string,
  subjectUserId: string,
  peers: readonly PeerAdmin[],
  now: Date,
): SelfReviewDecision {
  if (actorId !== subjectUserId) return { selfReview: false }
  const others = peers.filter((peer) => peer.id !== actorId)
  const reasons = others.map((peer) => ({ id: peer.id, name: peer.name, reason: peerUnavailableReason(peer, now) }))
  const available = reasons.filter((entry) => entry.reason === null)
  if (available.length > 0) {
    return {
      selfReview: true,
      allowed: false,
      error: `You cannot act on your own task while ${available.map((entry) => entry.name).join(', ')} can review it`,
    }
  }
  return {
    selfReview: true,
    allowed: true,
    peerReasons: reasons.map((entry) => ({ id: entry.id, name: entry.name, reason: entry.reason as UnavailableReason })),
  }
}
