import type { HandbookCategory, TeamTag } from '@prisma/client'
import { ALL_TEAMS, INTERNAL_TEAMS, type AudienceGroup } from './teams'
import type { PageInput } from './audience'

/**
 * A page as the admin sees it: the reader shape plus the recorded gap
 * decisions. Extends PageInput rather than widening it, so the reader stays
 * unable to see intentionalGapTeams -- it has no use for them.
 */
export type AdminPageInput = PageInput & { intentionalGapTeams: TeamTag[] }

export type CellState = 'COVERED' | 'INTENTIONAL' | 'UNREVIEWED'

export type CoverageCell = {
  team: TeamTag
  state: CellState
  variantId: string | null
}

export type CoverageRow = {
  pageId: string
  slug: string
  title: string
  category: HandbookCategory
  isPublished: boolean
  cells: CoverageCell[]
}

export type CoverageSummary = {
  total: number
  covered: number
  intentional: number
  unreviewed: number
}

/**
 * One cell per page x team. Three states, not two: without separating a
 * decision from an omission, permanently-intentional gaps would flag forever
 * and real omissions would hide in the noise.
 */
export function computeCoverage(pages: AdminPageInput[]): CoverageRow[] {
  return pages.map((page) => ({
    pageId: page.id,
    slug: page.slug,
    title: page.title,
    category: page.category,
    isPublished: page.isPublished,
    cells: ALL_TEAMS.map((team): CoverageCell => {
      const variant = page.variants.find((v) => v.audiences.includes(team))
      if (variant) {
        // Coverage beats the annotation: if a variant addresses this team, the
        // person can see it, whatever intentionalGapTeams claims.
        return { team, state: 'COVERED', variantId: variant.id }
      }
      const state: CellState = page.intentionalGapTeams.includes(team)
        ? 'INTENTIONAL'
        : 'UNREVIEWED'
      return { team, state, variantId: null }
    }),
  }))
}

export function summarizeCoverage(rows: CoverageRow[]): CoverageSummary {
  const cells = rows.flatMap((r) => r.cells)
  return {
    total: cells.length,
    covered: cells.filter((c) => c.state === 'COVERED').length,
    intentional: cells.filter((c) => c.state === 'INTENTIONAL').length,
    unreviewed: cells.filter((c) => c.state === 'UNREVIEWED').length,
  }
}

/**
 * Which derived group, if any, this exact set of teams represents.
 *
 * Takes readonly string[] rather than TeamTag[] deliberately: the editor holds
 * its audience state as string[], and a narrower signature here would force a
 * cast at every call site to buy nothing.
 */
export function matchGroup(teams: readonly string[]): AudienceGroup | null {
  const set = new Set(teams)
  if (set.size === ALL_TEAMS.length && ALL_TEAMS.every((t) => set.has(t))) {
    return 'EVERYONE'
  }
  if (set.size === INTERNAL_TEAMS.length && INTERNAL_TEAMS.every((t) => set.has(t))) {
    return 'PLUTUS21_INTERNAL'
  }
  return null
}
