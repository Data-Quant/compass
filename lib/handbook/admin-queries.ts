import type { TeamTag } from '@prisma/client'
import { prisma } from '@/lib/db'
import { findAudienceOverlap, type VariantInput } from './audience'
import type { AdminPageInput } from './coverage'

/**
 * Admin reads include UNPUBLISHED pages and EVERY variant body. That is
 * deliberate -- HR authors all teams' content. The reader-facing filtering
 * lives in lib/handbook/queries.ts and must stay separate.
 */
export async function getAllPagesForAdmin(): Promise<AdminPageInput[]> {
  const rows = await prisma.handbookPage.findMany({
    orderBy: [{ category: 'asc' }, { orderIndex: 'asc' }],
    include: {
      variants: {
        orderBy: { orderIndex: 'asc' },
        include: { audiences: { select: { team: true } } },
      },
    },
  })

  return rows.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    icon: p.icon,
    category: p.category,
    orderIndex: p.orderIndex,
    linkHref: p.linkHref,
    linkLabel: p.linkLabel,
    isPublished: p.isPublished,
    description: p.description,
    layout: p.layout,
    intentionalGapTeams: p.intentionalGapTeams,
    variants: p.variants.map((v) => ({
      id: v.id,
      bodyMarkdown: v.bodyMarkdown,
      orderIndex: v.orderIndex,
      audiences: v.audiences.map((a) => a.team),
    })),
  }))
}

/**
 * Teams claimed by more than one variant of `pageId`, treating `candidate` as
 * the state of one variant (excluded by id when updating, so an edit does not
 * collide with itself). Empty means safe.
 */
export async function findOverlapForPage(
  pageId: string,
  candidate: { variantId?: string; audiences: TeamTag[] }
): Promise<TeamTag[]> {
  const siblings = await prisma.handbookVariant.findMany({
    where: { pageId, ...(candidate.variantId ? { id: { not: candidate.variantId } } : {}) },
    include: { audiences: { select: { team: true } } },
  })

  // bodyMarkdown is irrelevant to overlap; '' keeps us from fetching page
  // bodies just to answer a question about audiences.
  const existing: VariantInput[] = siblings.map((v) => ({
    id: v.id,
    bodyMarkdown: '',
    orderIndex: v.orderIndex,
    audiences: v.audiences.map((a) => a.team),
  }))

  // Reuse Plan 1's tested resolver rather than restating the rule here -- two
  // copies of "what counts as an overlap" would eventually disagree.
  return findAudienceOverlap([
    ...existing,
    {
      id: candidate.variantId ?? '__candidate__',
      bodyMarkdown: '',
      orderIndex: 0,
      audiences: candidate.audiences,
    },
  ])
}
