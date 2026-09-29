/** Review actions whose score counts toward the quarter. */
export const CONFIRMED_REVIEW_ACTIONS = ['ACCEPTED', 'ADJUSTED', 'AUTO_ACCEPTED', 'MANUAL'] as const

export function isConfirmedAction(action: string | null | undefined): boolean {
  return action !== null && action !== undefined && (CONFIRMED_REVIEW_ACTIONS as readonly string[]).includes(action)
}

/** The latest review per answer; later reviews supersede earlier ones. */
export function latestByResponse<T extends { id: string; responseId: string; createdAt: Date }>(reviews: readonly T[]): Map<string, T> {
  const latest = new Map<string, T>()
  for (const review of reviews) {
    const current = latest.get(review.responseId)
    const newer = !current || review.createdAt > current.createdAt || (review.createdAt.getTime() === current.createdAt.getTime() && review.id > current.id)
    if (newer) latest.set(review.responseId, review)
  }
  return latest
}
