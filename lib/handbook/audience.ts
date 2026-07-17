import type { HandbookCategory, HandbookLayout, TeamTag } from '@prisma/client'
import { ALL_TEAMS } from './teams'

export type VariantInput = {
  id: string
  bodyMarkdown: string
  orderIndex: number
  audiences: TeamTag[]
}

export type PageInput = {
  id: string
  slug: string
  title: string
  icon: string
  category: HandbookCategory
  orderIndex: number
  linkHref: string | null
  linkLabel: string | null
  isPublished: boolean
  description: string | null
  layout: HandbookLayout | null
  variants: VariantInput[]
}

/** Hub entries deliberately carry NO body -- the hub cannot leak what it never holds. */
export type HubPage = {
  slug: string
  title: string
  icon: string
  category: HandbookCategory
  orderIndex: number
  linkHref: string | null
  linkLabel: string | null
  /** Shown under the title and searched over. Never a body -- the hub stays bodyless. */
  description: string | null
}

export type HubResponse = { pages: HubPage[]; untagged: boolean }

export type DetailResponse = {
  slug: string
  title: string
  icon: string
  category: HandbookCategory
  linkHref: string | null
  linkLabel: string | null
  description: string | null
  layout: HandbookLayout | null
  bodyMarkdown: string
}

/**
 * The one variant addressed to `tag`.
 *
 * For an untagged user the rule is deliberately "a single variant covering all
 * seven teams", not "seven teams covered across variants". A page like Leave
 * Policy reaches every team, but only by saying something different to each --
 * with no tag there is no right answer, so we withhold rather than guess.
 */
export function selectVariant(page: PageInput, tag: TeamTag | null): VariantInput | null {
  if (tag === null) {
    return page.variants.find((v) => ALL_TEAMS.every((t) => v.audiences.includes(t))) ?? null
  }
  return page.variants.find((v) => v.audiences.includes(tag)) ?? null
}

export function toHubResponse(pages: PageInput[], tag: TeamTag | null): HubResponse {
  const visible = pages
    .filter((p) => p.isPublished && selectVariant(p, tag) !== null)
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map(
      (p): HubPage => ({
        slug: p.slug,
        title: p.title,
        icon: p.icon,
        category: p.category,
        orderIndex: p.orderIndex,
        linkHref: p.linkHref,
        linkLabel: p.linkLabel,
        description: p.description,
      })
    )

  return { pages: visible, untagged: tag === null }
}

export function toDetailResponse(page: PageInput, tag: TeamTag | null): DetailResponse | null {
  if (!page.isPublished) return null

  const variant = selectVariant(page, tag)
  if (!variant) return null

  return {
    slug: page.slug,
    title: page.title,
    icon: page.icon,
    category: page.category,
    linkHref: page.linkHref,
    linkLabel: page.linkLabel,
    description: page.description,
    layout: page.layout,
    bodyMarkdown: variant.bodyMarkdown,
  }
}

/** Teams claimed by more than one variant of the same page. Must always be empty. */
export function findAudienceOverlap(variants: VariantInput[]): TeamTag[] {
  const seen = new Set<TeamTag>()
  const clashing = new Set<TeamTag>()

  for (const v of variants) {
    for (const t of v.audiences) {
      if (seen.has(t)) clashing.add(t)
      seen.add(t)
    }
  }

  return [...clashing]
}
