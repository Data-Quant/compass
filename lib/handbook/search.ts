import type { HubPage } from './audience'

/**
 * Filter the hub by title and description.
 *
 * Searches ONLY what the server already resolved for this user, and only the
 * fields the hub carries. The hub has no bodies by design, so search cannot
 * reach another team's content even in principle -- no new endpoint, no new
 * query, no widening of the audience rule.
 *
 * Pure so the behaviour is testable without a browser or a database.
 */
export function filterPages(pages: HubPage[], query: string): HubPage[] {
  const q = query.trim().toLowerCase()
  if (!q) return pages

  return pages.filter((p) => {
    const haystack = `${p.title} ${p.description ?? ''}`.toLowerCase()
    return haystack.includes(q)
  })
}
