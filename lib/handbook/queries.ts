import { prisma } from '@/lib/db'
import type { PageInput } from './audience'

/**
 * The only Prisma access for the Handbook. Everything else in lib/handbook is
 * pure so it can be tested without a database.
 */

const pageInclude = {
  variants: {
    orderBy: { orderIndex: 'asc' as const },
    include: { audiences: { select: { team: true } } },
  },
}

type PageRow = {
  id: string
  slug: string
  title: string
  icon: string
  category: PageInput['category']
  orderIndex: number
  linkHref: string | null
  linkLabel: string | null
  isPublished: boolean
  variants: Array<{
    id: string
    bodyMarkdown: string
    orderIndex: number
    audiences: Array<{ team: PageInput['variants'][number]['audiences'][number] }>
  }>
}

function toPageInput(p: PageRow): PageInput {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    icon: p.icon,
    category: p.category,
    orderIndex: p.orderIndex,
    linkHref: p.linkHref,
    linkLabel: p.linkLabel,
    isPublished: p.isPublished,
    variants: p.variants.map((v) => ({
      id: v.id,
      bodyMarkdown: v.bodyMarkdown,
      orderIndex: v.orderIndex,
      audiences: v.audiences.map((a) => a.team),
    })),
  }
}

/** Every published page with its variants and audiences, shaped for the pure resolver. */
export async function getAllPages(): Promise<PageInput[]> {
  const rows = await prisma.handbookPage.findMany({
    where: { isPublished: true },
    orderBy: { orderIndex: 'asc' },
    include: pageInclude,
  })

  return rows.map(toPageInput)
}

/** One page by slug, or null. Publication is enforced by the caller's resolver. */
export async function getPageBySlug(slug: string): Promise<PageInput | null> {
  const row = await prisma.handbookPage.findUnique({
    where: { slug },
    include: pageInclude,
  })

  return row ? toPageInput(row) : null
}
