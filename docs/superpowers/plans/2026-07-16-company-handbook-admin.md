# Company Handbook — Admin Authoring Console Implementation Plan (Plan 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give HR a console at `/admin/handbook` to author Handbook content in-app — the point of leaving Notion — with a coverage grid that makes gaps and overlaps impossible to miss.

**Architecture:** The coverage grid is the landing screen *and* the editing surface: 21 pages × 7 teams, each cell either covered, an intentional gap, or unreviewed. Grid computation is a **pure function** in `lib/handbook/coverage.ts` (no Prisma), matching Plan 1's split, so it is exhaustively testable without a database. Overlap is rejected server-side at save.

**Tech Stack:** Next.js 15 App Router, Prisma + Neon Postgres, iron-session auth, Tailwind + shadcn/ui, framer-motion.

**Spec:** `docs/superpowers/specs/2026-07-16-company-handbook-design.md` §6.1
**Plan 1 (shipped):** `docs/superpowers/plans/2026-07-16-company-handbook-reader.md`

**Prerequisite:** Plan 1 is merged to `main`. `HandbookPage`/`Variant`/`Audience` exist and are seeded with 21 pages / 31 variants; `lib/handbook/{teams,audience,queries}.ts` exist.

## Global Constraints

Every task's requirements implicitly include this section.

- **C1 — Additive only.** No existing table, column, row or behaviour is altered or removed. This plan adds **no migration** — the schema from Plan 1 is sufficient.
- **C2 — No policy content in git.** `Data-Quant/compass` is **public**. Never paste seeded body text into a source file, test fixture, comment or commit message. Test fixtures use invented content (`'BODY_A'`), never real policy.
- **C3 — No employee PII in git.**
- **C4 — Admin routes guard with `getSession()` + `isAdminRole()`.** Unlike the reader routes, admin responses **intentionally include every variant body** — HR is authorised to see all teams' content. This is not a leak; do not "fix" it. The Plan 1 leakage tests cover the employee-facing routes and must keep passing untouched.
- **C5 — Withhold rather than guess.** Applies to content: never invent policy text.
- **Do not use** `PageTransition`, `PageHeading` or `DataCard` — zero consumers. Follow the hand-rolled page pattern.
- **No `whileHover` / `whileTap`** — zero in the repo. Hover is CSS `transition-colors`.
- Neutral surfaces use CSS vars (`bg-card`, `text-muted-foreground`) with no `dark:`. Accents use explicit `dark:text-*-400` pairs.
- Branch: `feat/company-handbook-admin`, off `main`. Do **not** commit to `main` — it auto-deploys on push.
- Test command: `npx tsx --test tests/<file>.test.ts` for one file; `npm test` for all (`tests/api-integration.test.ts` needs `npm run dev` running).
- `npm run lint` is **broken repo-wide** (no ESLint config; `next lint` deprecated in Next 15.5). Do not try to fix it here — verify with `npx tsc --noEmit` and `npm run build`.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/handbook/coverage.ts` (create) | Pure grid computation + overlap/group helpers. No Prisma. |
| `lib/handbook/admin-queries.ts` (create) | Prisma access for admin reads/writes. |
| `app/api/admin/handbook/route.ts` (create) | GET all pages (grid), POST create page |
| `app/api/admin/handbook/[id]/route.ts` (create) | PUT update page, DELETE page |
| `app/api/admin/handbook/[id]/variants/route.ts` (create) | POST create variant |
| `app/api/admin/handbook/variants/[variantId]/route.ts` (create) | PUT update variant, DELETE variant |
| `app/(hr)/admin/handbook/page.tsx` (create) | Coverage grid (landing) |
| `app/(hr)/admin/handbook/[id]/page.tsx` (create) | Page + variant editor |
| `components/handbook/CoverageGrid.tsx` (create) | The 21×7 grid |
| `components/handbook/VariantEditor.tsx` (create) | Markdown body + team multi-select |
| `components/layout/AppSidebar.tsx` (modify) | One nav item in the Operations group |
| `tests/handbook-coverage.test.ts` (create) | Pure grid + overlap tests |

---

## Task 1: Pure coverage computation

**Files:**
- Create: `lib/handbook/coverage.ts`
- Test: `tests/handbook-coverage.test.ts`

**Interfaces:**
- Consumes: `TeamTag` (`@prisma/client`); `ALL_TEAMS`, `INTERNAL_TEAMS` (`lib/handbook/teams.ts`); `PageInput`, `VariantInput`, `findAudienceOverlap` (`lib/handbook/audience.ts`).
- Produces:
  - `type AdminPageInput = PageInput & { intentionalGapTeams: TeamTag[] }`
  - `type CellState = 'COVERED' | 'INTENTIONAL' | 'UNREVIEWED'`
  - `type CoverageCell = { team: TeamTag; state: CellState; variantId: string | null }`
  - `type CoverageRow = { pageId: string; slug: string; title: string; category: HandbookCategory; isPublished: boolean; cells: CoverageCell[] }`
  - `type CoverageSummary = { total: number; covered: number; intentional: number; unreviewed: number }`
  - `computeCoverage(pages: AdminPageInput[]): CoverageRow[]`
  - `summarizeCoverage(rows: CoverageRow[]): CoverageSummary`
  - `matchGroup(teams: readonly string[]): AudienceGroup | null`

`AdminPageInput` extends rather than modifies `PageInput` — Plan 1's reader code and its tests stay untouched (C1).

- [ ] **Step 1: Write the failing test**

Create `tests/handbook-coverage.test.ts`. Fixtures use invented bodies, never real policy text (C2):

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { ALL_TEAMS, INTERNAL_TEAMS } from '../lib/handbook/teams'
import {
  computeCoverage,
  summarizeCoverage,
  matchGroup,
  type AdminPageInput,
} from '../lib/handbook/coverage'

const base = {
  icon: 'FileText',
  category: 'POLICIES' as const,
  orderIndex: 0,
  linkHref: null,
  linkLabel: null,
  isPublished: true,
}

// Universal page: one variant, all seven teams.
const universal: AdminPageInput = {
  ...base,
  id: 'p1',
  slug: 'universal',
  title: 'Universal',
  intentionalGapTeams: [],
  variants: [{ id: 'v1', bodyMarkdown: 'BODY_A', orderIndex: 0, audiences: [...ALL_TEAMS] }],
}

// Pakistan-only, with the other six recorded as intentional gaps.
const pakistanOnly: AdminPageInput = {
  ...base,
  id: 'p2',
  slug: 'pakistan-only',
  title: 'Pakistan Only',
  intentionalGapTeams: ['MOROCCO', 'COLOMBIA', 'INDONESIA', 'NOBLE', 'THREE_E_PAKISTAN', 'THREE_E_MOROCCO'],
  variants: [{ id: 'v2', bodyMarkdown: 'BODY_B', orderIndex: 0, audiences: ['PAKISTAN'] }],
}

// Covers five; two gaps with NO decision recorded -> unreviewed.
const unreviewedGaps: AdminPageInput = {
  ...base,
  id: 'p3',
  slug: 'unreviewed-gaps',
  title: 'Unreviewed Gaps',
  intentionalGapTeams: [],
  variants: [
    {
      id: 'v3',
      bodyMarkdown: 'BODY_C',
      orderIndex: 0,
      audiences: ['PAKISTAN', 'MOROCCO', 'COLOMBIA', 'THREE_E_PAKISTAN', 'THREE_E_MOROCCO'],
    },
  ],
}

const pages = [universal, pakistanOnly, unreviewedGaps]

test('every row has one cell per team, in ALL_TEAMS order', () => {
  const rows = computeCoverage(pages)
  assert.equal(rows.length, 3)
  for (const row of rows) {
    assert.equal(row.cells.length, 7)
    assert.deepEqual(row.cells.map((c) => c.team), [...ALL_TEAMS])
  }
})

test('a team addressed by a variant is COVERED and carries that variant id', () => {
  const row = computeCoverage(pages).find((r) => r.slug === 'universal')!
  for (const cell of row.cells) {
    assert.equal(cell.state, 'COVERED')
    assert.equal(cell.variantId, 'v1')
  }
})

test('a gap listed in intentionalGapTeams is INTENTIONAL, not UNREVIEWED', () => {
  const row = computeCoverage(pages).find((r) => r.slug === 'pakistan-only')!
  const pk = row.cells.find((c) => c.team === 'PAKISTAN')!
  const ma = row.cells.find((c) => c.team === 'MOROCCO')!
  assert.equal(pk.state, 'COVERED')
  assert.equal(ma.state, 'INTENTIONAL')
  assert.equal(ma.variantId, null)
})

test('a gap with no decision recorded is UNREVIEWED', () => {
  const row = computeCoverage(pages).find((r) => r.slug === 'unreviewed-gaps')!
  assert.equal(row.cells.find((c) => c.team === 'INDONESIA')!.state, 'UNREVIEWED')
  assert.equal(row.cells.find((c) => c.team === 'NOBLE')!.state, 'UNREVIEWED')
  assert.equal(row.cells.find((c) => c.team === 'PAKISTAN')!.state, 'COVERED')
})

test('COVERED wins over an intentional gap claiming the same team', () => {
  // Contradictory data: a team both addressed and marked as an intentional gap.
  // Reality beats the annotation -- the person can see the content.
  const contradictory: AdminPageInput = {
    ...base,
    id: 'p4',
    slug: 'contradictory',
    title: 'Contradictory',
    intentionalGapTeams: ['PAKISTAN'],
    variants: [{ id: 'v4', bodyMarkdown: 'BODY_D', orderIndex: 0, audiences: ['PAKISTAN'] }],
  }
  const row = computeCoverage([contradictory])[0]
  assert.equal(row.cells.find((c) => c.team === 'PAKISTAN')!.state, 'COVERED')
})

test('summarize counts every cell exactly once', () => {
  const s = summarizeCoverage(computeCoverage(pages))
  assert.equal(s.total, 21) // 3 pages x 7 teams
  assert.equal(s.covered, 7 + 1 + 5)
  assert.equal(s.intentional, 6)
  assert.equal(s.unreviewed, 2)
  assert.equal(s.covered + s.intentional + s.unreviewed, s.total)
})

test('matchGroup recognises EVERYONE and PLUTUS21_INTERNAL', () => {
  assert.equal(matchGroup([...ALL_TEAMS]), 'EVERYONE')
  assert.equal(matchGroup([...INTERNAL_TEAMS]), 'PLUTUS21_INTERNAL')
  assert.equal(matchGroup(['PAKISTAN']), null)
})

test('matchGroup ignores ordering', () => {
  assert.equal(matchGroup([...ALL_TEAMS].reverse()), 'EVERYONE')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test tests/handbook-coverage.test.ts`
Expected: FAIL — `Cannot find module '../lib/handbook/coverage'`

- [ ] **Step 3: Write `lib/handbook/coverage.ts`**

```ts
import type { HandbookCategory, TeamTag } from '@prisma/client'
import { ALL_TEAMS, INTERNAL_TEAMS, type AudienceGroup } from './teams'
import type { PageInput } from './audience'

/** A page as the admin sees it: reader shape plus the recorded gap decisions. */
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test tests/handbook-coverage.test.ts`
Expected: PASS — 8 tests, 0 failures.

- [ ] **Step 5: Confirm Plan 1's tests still pass untouched**

Run: `npx tsx --test tests/handbook-audience.test.ts`
Expected: PASS — 14 tests. `AdminPageInput` extends `PageInput`; it must not have changed reader behaviour.

- [ ] **Step 6: Commit**

```bash
git add lib/handbook/coverage.ts tests/handbook-coverage.test.ts
git commit -m "feat: add pure Handbook coverage computation

Three cell states, not two: separating a reviewed decision from an omission is
what stops the 25 intentional gaps flagging forever and burying the real ones.

Coverage beats the annotation when they contradict -- if a variant addresses a
team, that team can see it whatever intentionalGapTeams claims.

AdminPageInput extends PageInput rather than modifying it, so Plan 1's reader
code and tests are untouched."
```

---

## Task 2: Admin queries and API routes

**Files:**
- Create: `lib/handbook/admin-queries.ts`
- Create: `app/api/admin/handbook/route.ts`
- Create: `app/api/admin/handbook/[id]/route.ts`
- Create: `app/api/admin/handbook/[id]/variants/route.ts`
- Create: `app/api/admin/handbook/variants/[variantId]/route.ts`

**Interfaces:**
- Consumes: `getSession` (`lib/auth.ts`), `isAdminRole` (`lib/permissions.ts`), `computeCoverage` / `summarizeCoverage` / `AdminPageInput` (Task 1), `findAudienceOverlap` / `VariantInput` (`lib/handbook/audience.ts`), `ALL_TEAMS` / `TEAM_LABELS` (`lib/handbook/teams.ts`).
- Produces:
  - `getAllPagesForAdmin(): Promise<AdminPageInput[]>` — **all** pages incl. unpublished
  - `findOverlapForPage(pageId: string, candidate: { variantId?: string; audiences: TeamTag[] }): Promise<TeamTag[]>`
  - `GET /api/admin/handbook` → `{ pages: AdminPageInput[], coverage: CoverageRow[], summary: CoverageSummary }`
  - `POST /api/admin/handbook` → `{ page }` (create)
  - `PUT /api/admin/handbook/[id]` → `{ page }` (metadata + intentionalGapTeams)
  - `DELETE /api/admin/handbook/[id]` → `{ success: true }`
  - `POST /api/admin/handbook/[id]/variants` → `{ variant }`
  - `PUT /api/admin/handbook/variants/[variantId]` → `{ variant }`
  - `DELETE /api/admin/handbook/variants/[variantId]` → `{ success: true }`

- [ ] **Step 1: Write `lib/handbook/admin-queries.ts`**

```ts
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
```

- [ ] **Step 2: Write `app/api/admin/handbook/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { getAllPagesForAdmin } from '@/lib/handbook/admin-queries'
import { computeCoverage, summarizeCoverage } from '@/lib/handbook/coverage'

const VALID_CATEGORIES = [
  'START_HERE',
  'THE_COMPANY',
  'POLICIES',
  'BENEFITS_AND_REWARDS',
  'PERFORMANCE',
  'HOW_TO',
] as const

export async function GET() {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const pages = await getAllPagesForAdmin()
    const coverage = computeCoverage(pages)
    return NextResponse.json({ pages, coverage, summary: summarizeCoverage(coverage) })
  } catch (error) {
    console.error('Failed to fetch handbook admin data:', error)
    return NextResponse.json({ error: 'Failed to fetch handbook' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { slug, title, icon, category, orderIndex } = (await request.json()) as {
      slug?: string
      title?: string
      icon?: string
      category?: string
      orderIndex?: number
    }

    if (!slug || !title) {
      return NextResponse.json({ error: 'Slug and title are required' }, { status: 400 })
    }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
      return NextResponse.json(
        { error: 'Slug must be lowercase words separated by hyphens' },
        { status: 400 }
      )
    }
    if (!category || !VALID_CATEGORIES.includes(category as (typeof VALID_CATEGORIES)[number])) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 })
    }

    const page = await prisma.handbookPage.create({
      data: {
        slug,
        title,
        icon: icon || 'FileText',
        category: category as (typeof VALID_CATEGORIES)[number],
        orderIndex: orderIndex ?? 0,
        isPublished: false,
      },
    })

    return NextResponse.json({ page })
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: 'A page with that slug already exists' }, { status: 400 })
    }
    console.error('Failed to create handbook page:', error)
    return NextResponse.json({ error: 'Failed to create page' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Write `app/api/admin/handbook/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { ALL_TEAMS } from '@/lib/handbook/teams'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const { title, icon, category, orderIndex, linkHref, linkLabel, isPublished, intentionalGapTeams } =
      (await request.json()) as {
        title?: string
        icon?: string
        category?: string
        orderIndex?: number
        linkHref?: string | null
        linkLabel?: string | null
        isPublished?: boolean
        intentionalGapTeams?: string[]
      }

    if (intentionalGapTeams) {
      const invalid = intentionalGapTeams.filter(
        (t) => !(ALL_TEAMS as readonly string[]).includes(t)
      )
      if (invalid.length) {
        return NextResponse.json(
          { error: `Invalid team(s): ${invalid.join(', ')}` },
          { status: 400 }
        )
      }
    }

    const page = await prisma.handbookPage.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title } : {}),
        ...(icon !== undefined ? { icon } : {}),
        ...(category !== undefined ? { category: category as never } : {}),
        ...(orderIndex !== undefined ? { orderIndex } : {}),
        ...(linkHref !== undefined ? { linkHref: linkHref || null } : {}),
        ...(linkLabel !== undefined ? { linkLabel: linkLabel || null } : {}),
        ...(isPublished !== undefined ? { isPublished } : {}),
        ...(intentionalGapTeams !== undefined
          ? { intentionalGapTeams: intentionalGapTeams as never }
          : {}),
      },
    })

    return NextResponse.json({ page })
  } catch (error) {
    console.error('Failed to update handbook page:', error)
    return NextResponse.json({ error: 'Failed to update page' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    // Variants and their audiences cascade.
    await prisma.handbookPage.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete handbook page:', error)
    return NextResponse.json({ error: 'Failed to delete page' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Write `app/api/admin/handbook/[id]/variants/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import type { TeamTag } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { ALL_TEAMS, TEAM_LABELS } from '@/lib/handbook/teams'
import { findOverlapForPage } from '@/lib/handbook/admin-queries'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: pageId } = await params
    const { bodyMarkdown, audiences } = (await request.json()) as {
      bodyMarkdown?: string
      audiences?: string[]
    }

    if (!audiences?.length) {
      return NextResponse.json({ error: 'Select at least one team' }, { status: 400 })
    }
    const invalid = audiences.filter((t) => !(ALL_TEAMS as readonly string[]).includes(t))
    if (invalid.length) {
      return NextResponse.json({ error: `Invalid team(s): ${invalid.join(', ')}` }, { status: 400 })
    }

    // Two variants of one page must never claim the same team -- that reader
    // would see two conflicting policies with no way to tell which is theirs.
    // The cast is sound: audiences was just validated against ALL_TEAMS.
    const overlap = await findOverlapForPage(pageId, { audiences: audiences as TeamTag[] })
    if (overlap.length) {
      const names = overlap.map((t) => TEAM_LABELS[t]).join(', ')
      return NextResponse.json(
        { error: `Another variant of this page already covers: ${names}` },
        { status: 400 }
      )
    }

    const count = await prisma.handbookVariant.count({ where: { pageId } })
    const variant = await prisma.handbookVariant.create({
      data: {
        pageId,
        bodyMarkdown: bodyMarkdown ?? '',
        orderIndex: count,
        audiences: { create: audiences.map((team) => ({ team: team as never })) },
      },
      include: { audiences: { select: { team: true } } },
    })

    return NextResponse.json({ variant })
  } catch (error) {
    console.error('Failed to create handbook variant:', error)
    return NextResponse.json({ error: 'Failed to create variant' }, { status: 500 })
  }
}
```

- [ ] **Step 5: Write `app/api/admin/handbook/variants/[variantId]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import type { TeamTag } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { ALL_TEAMS, TEAM_LABELS } from '@/lib/handbook/teams'
import { findOverlapForPage } from '@/lib/handbook/admin-queries'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ variantId: string }> }
) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { variantId } = await params
    const { bodyMarkdown, audiences } = (await request.json()) as {
      bodyMarkdown?: string
      audiences?: string[]
    }

    const existing = await prisma.handbookVariant.findUnique({
      where: { id: variantId },
      select: { pageId: true },
    })
    if (!existing) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (audiences) {
      if (!audiences.length) {
        return NextResponse.json({ error: 'Select at least one team' }, { status: 400 })
      }
      const invalid = audiences.filter((t) => !(ALL_TEAMS as readonly string[]).includes(t))
      if (invalid.length) {
        return NextResponse.json({ error: `Invalid team(s): ${invalid.join(', ')}` }, { status: 400 })
      }

      // Excluding this variant by id is what lets an edit that keeps its own
      // teams save cleanly instead of colliding with itself.
      const overlap = await findOverlapForPage(existing.pageId, {
        variantId,
        audiences: audiences as TeamTag[],
      })
      if (overlap.length) {
        const names = overlap.map((t) => TEAM_LABELS[t]).join(', ')
        return NextResponse.json(
          { error: `Another variant of this page already covers: ${names}` },
          { status: 400 }
        )
      }
    }

    const variant = await prisma.$transaction(async (tx) => {
      if (audiences) {
        await tx.handbookAudience.deleteMany({ where: { variantId } })
        await tx.handbookAudience.createMany({
          data: audiences.map((team) => ({ variantId, team: team as never })),
        })
      }
      return tx.handbookVariant.update({
        where: { id: variantId },
        data: { ...(bodyMarkdown !== undefined ? { bodyMarkdown } : {}) },
        include: { audiences: { select: { team: true } } },
      })
    })

    return NextResponse.json({ variant })
  } catch (error) {
    console.error('Failed to update handbook variant:', error)
    return NextResponse.json({ error: 'Failed to update variant' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ variantId: string }> }
) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { variantId } = await params
    await prisma.handbookVariant.delete({ where: { id: variantId } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete handbook variant:', error)
    return NextResponse.json({ error: 'Failed to delete variant' }, { status: 500 })
  }
}
```

- [ ] **Step 6: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Verify the auth guards fire**

Run `npm run dev`, then in another terminal:

```bash
for p in /api/admin/handbook; do
  echo "$p -> $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000$p)"
done
```
Expected: `401` — no session cookie.

- [ ] **Step 8: Commit**

```bash
git add lib/handbook/admin-queries.ts app/api/admin/handbook
git commit -m "feat: add Handbook admin API

All routes guard with getSession() + isAdminRole(). Admin responses include
unpublished pages and every variant body -- deliberate, HR authors all teams'
content. The reader routes' filtering is untouched and its leakage tests still
pass.

Overlap is rejected at save on both create and update: two variants of one page
must never claim the same team, or that reader sees two conflicting policies
with no way to tell which is theirs."
```

---

## Task 3: The coverage grid

**Files:**
- Create: `components/handbook/CoverageGrid.tsx`
- Create: `app/(hr)/admin/handbook/page.tsx`
- Modify: `components/layout/AppSidebar.tsx` (ADMIN_SIDEBAR Operations group)

**Interfaces:**
- Consumes: `GET /api/admin/handbook` (Task 2); `TEAM_LABELS`, `ALL_TEAMS` (`lib/handbook/teams.ts`); `CoverageRow`, `CoverageSummary` (Task 1).
- Produces: the `/admin/handbook` route.

- [ ] **Step 1: Add the nav item**

In `components/layout/AppSidebar.tsx`, `ADMIN_SIDEBAR` → the `Operations` group's `items`, after `Office`:

```ts
        { label: 'Handbook', href: '/admin/handbook', icon: BookOpen },
```

`BookOpen` is already imported (Plan 1). Do not add a duplicate import.

- [ ] **Step 2: Write `components/handbook/CoverageGrid.tsx`**

Three cell states rendered distinctly. Accent colours use explicit `dark:` pairs; neutrals use CSS vars.

```tsx
'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { ALL_TEAMS, TEAM_LABELS } from '@/lib/handbook/teams'
import type { CoverageRow } from '@/lib/handbook/coverage'

const SHORT_LABELS: Record<string, string> = {
  PAKISTAN: 'PK',
  MOROCCO: 'MA',
  COLOMBIA: 'CO',
  INDONESIA: 'ID',
  NOBLE: 'NB',
  THREE_E_PAKISTAN: '3E PK',
  THREE_E_MOROCCO: '3E MA',
}

export function CoverageGrid({ rows }: { rows: CoverageRow[] }) {
  return (
    // Wide content scrolls inside its own container -- the page body must never
    // scroll horizontally.
    <div className="overflow-x-auto rounded-card border border-border">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="text-left font-medium text-foreground bg-muted/50 px-3 py-2 border-b border-border sticky left-0 z-10">
              Page
            </th>
            {ALL_TEAMS.map((team) => (
              <th
                key={team}
                title={TEAM_LABELS[team]}
                className="font-medium text-muted-foreground bg-muted/50 px-2 py-2 border-b border-border text-center whitespace-nowrap"
              >
                {SHORT_LABELS[team]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.pageId} className="hover:bg-muted/40 transition-colors">
              <td className="px-3 py-2 border-b border-border">
                <Link
                  href={`/admin/handbook/${row.pageId}`}
                  className="text-foreground hover:text-primary transition-colors"
                >
                  {row.title}
                </Link>
                {!row.isPublished && (
                  <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    Draft
                  </span>
                )}
              </td>
              {row.cells.map((cell) => (
                <td key={cell.team} className="px-2 py-2 border-b border-border text-center">
                  <Link
                    href={`/admin/handbook/${row.pageId}?team=${cell.team}`}
                    title={`${row.title} — ${TEAM_LABELS[cell.team]}: ${cell.state.toLowerCase()}`}
                    className={cn(
                      'inline-flex h-6 w-6 items-center justify-center rounded-md text-xs transition-colors',
                      cell.state === 'COVERED' &&
                        'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20',
                      cell.state === 'INTENTIONAL' && 'text-muted-foreground/50 hover:bg-muted',
                      cell.state === 'UNREVIEWED' &&
                        'bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20'
                    )}
                  >
                    {cell.state === 'COVERED' ? '●' : cell.state === 'INTENTIONAL' ? '–' : '⚠'}
                  </Link>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 3: Write `app/(hr)/admin/handbook/page.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { StatsCard } from '@/components/composed/StatsCard'
import { CoverageGrid } from '@/components/handbook/CoverageGrid'
import type { CoverageRow, CoverageSummary } from '@/lib/handbook/coverage'

const stagger = {
  container: { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } },
  item: { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } },
}

export default function AdminHandbookPage() {
  const [coverage, setCoverage] = useState<CoverageRow[]>([])
  const [summary, setSummary] = useState<CoverageSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/handbook')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          toast.error(d.error)
          return
        }
        setCoverage(d.coverage || [])
        setSummary(d.summary || null)
      })
      .catch(() => toast.error('Failed to load handbook'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingScreen />

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-display font-light tracking-tight text-foreground">
          Handbook
        </h1>
        <p className="text-muted-foreground mt-1">
          Every page, and which teams it reaches. Click a cell to edit.
        </p>
      </motion.div>

      {summary && (
        <motion.div
          variants={stagger.container}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
        >
          <motion.div variants={stagger.item}>
            <StatsCard title="Pages" value={coverage.length} />
          </motion.div>
          <motion.div variants={stagger.item}>
            <StatsCard title="Covered" value={summary.covered} suffix={`/${summary.total}`} />
          </motion.div>
          <motion.div variants={stagger.item}>
            <StatsCard title="Intentional gaps" value={summary.intentional} />
          </motion.div>
          <motion.div variants={stagger.item}>
            <StatsCard title="Needs a decision" value={summary.unreviewed} />
          </motion.div>
        </motion.div>
      )}

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <div className="flex items-center gap-4 mb-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="text-emerald-600 dark:text-emerald-400">●</span> Covered
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-muted-foreground/50">–</span> Intentional gap
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-amber-600 dark:text-amber-400">⚠</span> Needs a decision
          </span>
        </div>
        <CoverageGrid rows={coverage} />
      </motion.div>
    </div>
  )
}
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Verify against the real seeded data**

Run `npm run dev`, log in as an HR user, open `/admin/handbook`.

Expected, matching the seeded state exactly:
- **21** pages, **117** covered, **25** intentional, **5** needs-a-decision.
- The 5 amber cells are: Benefits × Indonesia; Company Equipment × Indonesia; Company Equipment × Noble; SOP: Faulty Equipment × Indonesia; SOP: Faulty Equipment × Noble.
- Travel Policy shows one green cell (Pakistan) and six grey dashes — an intentional gap reading as a decision, not a warning.

If the numbers differ, stop — either the grid logic or the seed is wrong.

- [ ] **Step 6: Verify both themes**

Toggle light/dark. Green, grey and amber cells must all be legible in both, and the grid must scroll inside its own container without the page body scrolling horizontally.

- [ ] **Step 7: Commit**

```bash
git add components/handbook/CoverageGrid.tsx "app/(hr)/admin/handbook/page.tsx" components/layout/AppSidebar.tsx
git commit -m "feat: add Handbook coverage grid

The landing screen and the editing surface in one: 21 pages x 7 teams, click a
cell to edit that variant. Three states so a reviewed decision reads
differently from an omission -- seeded state shows 5 amber cells (the real open
questions) instead of 30 gaps that mostly need nothing."
```

---

## Task 4: Page and variant editor

**Files:**
- Create: `components/handbook/VariantEditor.tsx`
- Create: `app/(hr)/admin/handbook/[id]/page.tsx`

**Interfaces:**
- Consumes: Task 2's routes; `HandbookMarkdown` (Plan 1); `ALL_TEAMS`, `TEAM_LABELS`, `expandGroup` (`lib/handbook/teams.ts`); `matchGroup` (Task 1).
- Produces: the `/admin/handbook/[id]` route.

- [ ] **Step 1: Write `components/handbook/VariantEditor.tsx`**

Markdown textarea with a live preview, plus the team multi-select with group expansion.

```tsx
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Trash2, Eye, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ALL_TEAMS, TEAM_LABELS, expandGroup } from '@/lib/handbook/teams'
import { matchGroup } from '@/lib/handbook/coverage'
import { HandbookMarkdown } from '@/components/handbook/HandbookMarkdown'

export type EditableVariant = {
  id: string
  bodyMarkdown: string
  audiences: string[]
}

export function VariantEditor({
  variant,
  onSaved,
  onDeleted,
}: {
  variant: EditableVariant
  onSaved: () => void
  onDeleted: () => void
}) {
  const [body, setBody] = useState(variant.bodyMarkdown)
  const [audiences, setAudiences] = useState<string[]>(variant.audiences)
  const [preview, setPreview] = useState(false)
  const [saving, setSaving] = useState(false)

  const group = matchGroup(audiences)

  const toggleTeam = (team: string) => {
    setAudiences((prev) =>
      prev.includes(team) ? prev.filter((t) => t !== team) : [...prev, team]
    )
  }

  const save = async () => {
    if (!audiences.length) {
      toast.error('Select at least one team')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/handbook/variants/${variant.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bodyMarkdown: body, audiences }),
      })
      const data = await res.json()
      if (data.error) {
        toast.error(data.error)
        return
      }
      toast.success('Variant saved')
      onSaved()
    } catch {
      toast.error('Failed to save variant')
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!confirm('Delete this variant? The teams it covers will show as gaps.')) return
    const res = await fetch(`/api/admin/handbook/variants/${variant.id}`, { method: 'DELETE' })
    const data = await res.json()
    if (data.error) {
      toast.error(data.error)
      return
    }
    toast.success('Variant deleted')
    onDeleted()
  }

  return (
    <Card className="mb-6">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Label className="mb-0">Audience</Label>
            {group && (
              <Badge variant="secondary">
                {group === 'EVERYONE' ? 'Everyone' : 'Plutus21 Internal Team'}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPreview((p) => !p)}>
              {preview ? <Pencil className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              <span className="ml-1.5">{preview ? 'Edit' : 'Preview'}</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={remove}>
              <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
            </Button>
          </div>
        </div>

        {/* Group expansions write the underlying teams -- the groups are never stored. */}
        <div className="flex flex-wrap gap-2 mb-3">
          <Button variant="outline" size="sm" onClick={() => setAudiences(expandGroup('EVERYONE'))}>
            Everyone
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAudiences(expandGroup('PLUTUS21_INTERNAL'))}
          >
            Plutus21 Internal
          </Button>
        </div>

        <div className="flex flex-wrap gap-2 mb-5">
          {ALL_TEAMS.map((team) => {
            const on = audiences.includes(team)
            return (
              <button
                key={team}
                type="button"
                onClick={() => toggleTeam(team)}
                className={cn(
                  'rounded-badge border px-3 py-1 text-xs transition-colors',
                  on
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-muted'
                )}
              >
                {TEAM_LABELS[team]}
              </button>
            )
          })}
        </div>

        <Label htmlFor={`body-${variant.id}`} className="mb-1">
          Body (Markdown)
        </Label>
        {preview ? (
          <div className="rounded-lg border border-border p-4 min-h-[300px]">
            <HandbookMarkdown source={body} />
          </div>
        ) : (
          <Textarea
            id={`body-${variant.id}`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="min-h-[300px] font-mono text-xs"
          />
        )}

        <div className="mt-4 flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save variant'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Write `app/(hr)/admin/handbook/[id]/page.tsx`**

```tsx
'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { ArrowLeft, Plus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { VariantEditor, type EditableVariant } from '@/components/handbook/VariantEditor'
import { ALL_TEAMS, TEAM_LABELS } from '@/lib/handbook/teams'
import { cn } from '@/lib/utils'

type AdminPage = {
  id: string
  slug: string
  title: string
  icon: string
  category: string
  orderIndex: number
  linkHref: string | null
  linkLabel: string | null
  isPublished: boolean
  intentionalGapTeams: string[]
  variants: EditableVariant[]
}

export default function AdminHandbookPageEditor({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const [page, setPage] = useState<AdminPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    return fetch('/api/admin/handbook')
      .then((r) => r.json())
      .then((d) => {
        const found = (d.pages || []).find((p: AdminPage) => p.id === id) || null
        setPage(found)
      })
      .catch(() => toast.error('Failed to load page'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const savePage = async (patch: Partial<AdminPage>) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/handbook/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json()
      if (data.error) {
        toast.error(data.error)
        return
      }
      toast.success('Page saved')
      await load()
    } catch {
      toast.error('Failed to save page')
    } finally {
      setSaving(false)
    }
  }

  const addVariant = async () => {
    const res = await fetch(`/api/admin/handbook/${id}/variants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bodyMarkdown: '', audiences: [] }),
    })
    const data = await res.json()
    if (data.error) {
      // Expected when every team is already covered -- explain rather than fail.
      toast.error(data.error)
      return
    }
    await load()
  }

  if (loading) return <LoadingScreen />
  if (!page) {
    return (
      <div className="p-6 sm:p-8 max-w-4xl mx-auto">
        <p className="text-muted-foreground">Page not found.</p>
      </div>
    )
  }

  const coveredTeams = new Set(page.variants.flatMap((v) => v.audiences))
  const gapTeams = ALL_TEAMS.filter((t) => !coveredTeams.has(t))

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <Link
          href="/admin/handbook"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Coverage grid
        </Link>
        <h1 className="text-2xl sm:text-3xl font-display font-light tracking-tight text-foreground">
          {page.title}
        </h1>
        <p className="text-muted-foreground mt-1">/handbook/{page.slug}</p>
      </motion.div>

      <Card className="mb-6">
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="title" className="mb-1">Title</Label>
              <Input
                id="title"
                defaultValue={page.title}
                onBlur={(e) => e.target.value !== page.title && savePage({ title: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="icon" className="mb-1">Icon (lucide name)</Label>
              <Input
                id="icon"
                defaultValue={page.icon}
                onBlur={(e) => e.target.value !== page.icon && savePage({ icon: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="linkHref" className="mb-1">Action link (optional)</Label>
              <Input
                id="linkHref"
                defaultValue={page.linkHref || ''}
                placeholder="/leave"
                onBlur={(e) => savePage({ linkHref: e.target.value || null })}
              />
            </div>
            <div>
              <Label htmlFor="linkLabel" className="mb-1">Action label (optional)</Label>
              <Input
                id="linkLabel"
                defaultValue={page.linkLabel || ''}
                placeholder="Apply for leave"
                onBlur={(e) => savePage({ linkLabel: e.target.value || null })}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium text-foreground">Published</p>
              <p className="text-xs text-muted-foreground">
                Unpublished pages are hidden from everyone.
              </p>
            </div>
            <Switch
              checked={page.isPublished}
              onCheckedChange={(v) => savePage({ isPublished: v })}
              disabled={saving}
            />
          </div>

          {gapTeams.length > 0 && (
            <div className="rounded-lg border border-border p-3">
              <p className="text-sm font-medium text-foreground mb-1">Teams with no variant</p>
              <p className="text-xs text-muted-foreground mb-3">
                Mark a gap as intentional to record that it is deliberate — it will stop flagging
                on the grid.
              </p>
              <div className="flex flex-wrap gap-2">
                {gapTeams.map((team) => {
                  const intentional = page.intentionalGapTeams.includes(team)
                  return (
                    <button
                      key={team}
                      type="button"
                      onClick={() =>
                        savePage({
                          intentionalGapTeams: intentional
                            ? page.intentionalGapTeams.filter((t) => t !== team)
                            : [...page.intentionalGapTeams, team],
                        })
                      }
                      className={cn(
                        'rounded-badge border px-3 py-1 text-xs transition-colors',
                        intentional
                          ? 'border-border text-muted-foreground hover:bg-muted'
                          : 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20'
                      )}
                    >
                      {TEAM_LABELS[team]} {intentional ? '– intentional' : '⚠ needs a decision'}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">
          Variants ({page.variants.length})
        </h2>
        <Button variant="outline" size="sm" onClick={addVariant}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add variant
        </Button>
      </div>

      {page.variants.map((v) => (
        <VariantEditor key={v.id} variant={v} onSaved={load} onDeleted={load} />
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify the overlap guard actually fires**

Run `npm run dev`, log in as HR, open `/admin/handbook`, click Leave Policy.

1. On the variant covering the 3E Morocco team, also tick **Pakistan Team**, and save.
2. Expected: a red toast — *"Another variant of this page already covers: Pakistan Team"* — and **no change persists**. Reload to confirm the audience is unchanged.

This is the guard that stops a reader seeing two conflicting leave policies. If the save succeeds, stop — the guard is broken.

- [ ] **Step 5: Verify the round-trip on real content**

On Leave Policy's Pakistan variant, click Preview — the markdown must render with its table intact. Make a trivial edit (add a space), save, reload, confirm it persisted, then undo it.

- [ ] **Step 6: Verify the intentional-gap toggle**

Open Company Equipment Policy. Indonesia and Noble should show as **⚠ needs a decision**. Click Indonesia → it becomes **– intentional**. Return to the grid: that cell is now grey, and "Needs a decision" drops from 5 to 4. Click it back to restore 5.

- [ ] **Step 7: Commit**

```bash
git add components/handbook/VariantEditor.tsx "app/(hr)/admin/handbook/[id]/page.tsx"
git commit -m "feat: add Handbook page and variant editor

Markdown body with live preview, team multi-select with Everyone / Plutus21
Internal expansion (the groups expand to the underlying teams -- they are never
stored), and a toggle to record a gap as intentional so it stops flagging.

Overlap is rejected server-side: a variant cannot claim a team another variant
of the same page already covers."
```

---

## Task 5: Preview as team

**Files:**
- Modify: `app/(evaluator)/handbook/page.tsx`
- Modify: `app/(evaluator)/handbook/[slug]/page.tsx`
- Modify: `app/api/handbook/route.ts`
- Modify: `app/api/handbook/[slug]/route.ts`

**Interfaces:**
- Consumes: `isAdminRole` (`lib/permissions.ts`); Plan 1's reader routes.
- Produces: `?previewTeam=<TeamTag>` on both reader routes, **HR only**.

**Why it lives on the reader route:** previewing must exercise the real resolution path. A separate preview endpoint could drift from what employees actually get, which would make the preview a lie.

- [ ] **Step 1: Add the preview override to `app/api/handbook/route.ts`**

Replace the file body with:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { getAllPages } from '@/lib/handbook/queries'
import { toHubResponse } from '@/lib/handbook/audience'
import { ALL_TEAMS } from '@/lib/handbook/teams'
import type { TeamTag } from '@prisma/client'

/**
 * The team to resolve against. Normally the session user's own tag. HR may
 * override with ?previewTeam= to see any team's view -- and ONLY HR: for
 * anyone else this silently falls back to their own tag, so the override can
 * never be used to read another team's terms.
 */
function resolveTeam(request: NextRequest, user: { role: string; teamTag: TeamTag | null }) {
  const requested = request.nextUrl.searchParams.get('previewTeam')
  if (!requested || !isAdminRole(user.role)) return user.teamTag
  if (requested === 'UNTAGGED') return null
  return (ALL_TEAMS as readonly string[]).includes(requested)
    ? (requested as TeamTag)
    : user.teamTag
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Filtering happens here, on the server, against the resolved tag. Never
    // return every variant for the client to filter -- teams differ on
    // compensation terms.
    const pages = await getAllPages()
    return NextResponse.json(toHubResponse(pages, resolveTeam(request, user)))
  } catch (error) {
    console.error('Failed to fetch handbook hub:', error)
    return NextResponse.json({ error: 'Failed to fetch handbook' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Apply the same override to `app/api/handbook/[slug]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { getPageBySlug } from '@/lib/handbook/queries'
import { toDetailResponse } from '@/lib/handbook/audience'
import { ALL_TEAMS } from '@/lib/handbook/teams'
import type { TeamTag } from '@prisma/client'

function resolveTeam(request: NextRequest, user: { role: string; teamTag: TeamTag | null }) {
  const requested = request.nextUrl.searchParams.get('previewTeam')
  if (!requested || !isAdminRole(user.role)) return user.teamTag
  if (requested === 'UNTAGGED') return null
  return (ALL_TEAMS as readonly string[]).includes(requested)
    ? (requested as TeamTag)
    : user.teamTag
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { slug } = await params
    const page = await getPageBySlug(slug)
    if (!page) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const detail = toDetailResponse(page, resolveTeam(request, user))
    if (!detail) {
      // The page exists but nothing addresses this team, or it is unpublished.
      // A 404 is correct -- an empty page would imply content is missing.
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json(detail)
  } catch (error) {
    console.error('Failed to fetch handbook page:', error)
    return NextResponse.json({ error: 'Failed to fetch handbook page' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Add the preview switcher to the hub**

In `app/(evaluator)/handbook/page.tsx`:

Add imports:

```tsx
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { ALL_TEAMS } from '@/lib/handbook/teams'
import { isAdminRole } from '@/lib/permissions'
```

Rename the existing default export to `HandbookHubInner`, read the param, and append it to the fetch:

```tsx
  const searchParams = useSearchParams()
  const previewTeam = searchParams.get('previewTeam')

  useEffect(() => {
    const qs = previewTeam ? `?previewTeam=${previewTeam}` : ''
    fetch(`/api/handbook${qs}`)
      .then((r) => r.json())
      .then((d) => {
        setPages(d.pages || [])
        setUntagged(Boolean(d.untagged))
      })
      .catch(() => setPages([]))
      .finally(() => setLoading(false))
  }, [previewTeam])
```

Render the switcher directly above the hero, for HR only:

```tsx
      {user && isAdminRole(user.role) && (
        <div className="flex flex-wrap items-center gap-2 mb-6 rounded-lg border border-border bg-muted/40 px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground mr-1">Preview as</span>
          <Link
            href="/handbook"
            className={cn(
              'rounded-badge border px-2.5 py-0.5 text-xs transition-colors',
              !previewTeam ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
            )}
          >
            Me
          </Link>
          <Link
            href="/handbook?previewTeam=UNTAGGED"
            className={cn(
              'rounded-badge border px-2.5 py-0.5 text-xs transition-colors',
              previewTeam === 'UNTAGGED' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
            )}
          >
            Untagged
          </Link>
          {ALL_TEAMS.map((team) => (
            <Link
              key={team}
              href={`/handbook?previewTeam=${team}`}
              className={cn(
                'rounded-badge border px-2.5 py-0.5 text-xs transition-colors',
                previewTeam === team ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
              )}
            >
              {TEAM_LABELS[team]}
            </Link>
          ))}
        </div>
      )}
```

Add `Link` and `cn` imports. Then wrap in Suspense — `useSearchParams` requires it:

```tsx
export default function HandbookHubPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <HandbookHubInner />
    </Suspense>
  )
}
```

Tile links must carry the param through so preview survives navigation. In the `HandbookTile` usage, pass it:

```tsx
                    <HandbookTile
                      slug={p.slug}
                      title={p.title}
                      icon={p.icon}
                      linkLabel={p.linkLabel}
                      previewTeam={previewTeam}
                    />
```

And in `components/handbook/HandbookTile.tsx`, accept and append it:

```tsx
type Props = {
  slug: string
  title: string
  icon: string
  linkLabel: string | null
  previewTeam?: string | null
}

export function HandbookTile({ slug, title, icon, linkLabel, previewTeam }: Props) {
  const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[icon] ?? Icons.FileText
  const href = previewTeam ? `/handbook/${slug}?previewTeam=${previewTeam}` : `/handbook/${slug}`
  return (
    <Link href={href} className="block h-full">
      {/* ...unchanged... */}
```

- [ ] **Step 4: Read the param on the detail page**

In `app/(evaluator)/handbook/[slug]/page.tsx`, rename the default export to `HandbookDetailInner`, then:

```tsx
  const searchParams = useSearchParams()
  const previewTeam = searchParams.get('previewTeam')

  useEffect(() => {
    let cancelled = false
    const qs = previewTeam ? `?previewTeam=${previewTeam}` : ''

    fetch(`/api/handbook/${slug}${qs}`)
      // ...unchanged...
  }, [slug, previewTeam])
```

Wrap in Suspense the same way, and point the back-link at `/handbook${previewTeam ? \`?previewTeam=${previewTeam}\` : ''}`.

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Verify the privilege boundary — the important one**

Run `npm run dev`.

1. **As HR:** open `/handbook?previewTeam=THREE_E_PAKISTAN`. Expected: 13 tiles; Leave Policy shows the 3E Pakistan text. Try `?previewTeam=UNTAGGED` → 9 tiles and the amber banner.
2. **As a non-HR employee** (set your own role to EMPLOYEE via `/admin/users`, or use a second account): open `/handbook?previewTeam=PAKISTAN`. Expected: **the override is ignored** — you see your own team's content, not Pakistan's.

Confirm at the API level too:

```bash
# As a non-HR session, the override must not change the response.
curl -s -b "pe_session=<employee-cookie>" "http://localhost:3000/api/handbook?previewTeam=PAKISTAN" | head -c 200
```

If a non-HR user's view changes with `previewTeam`, **stop** — that is a cross-team leak and the whole point of C4.

- [ ] **Step 7: Confirm Plan 1's leakage tests still pass**

Run: `npx tsx --test tests/handbook-audience.test.ts`
Expected: PASS — 14 tests. The pure resolver was not touched; only the route's choice of which tag to pass it.

- [ ] **Step 8: Commit**

```bash
git add "app/(evaluator)/handbook" app/api/handbook components/handbook/HandbookTile.tsx
git commit -m "feat: add preview-as-team for HR

?previewTeam= overrides the resolved tag on the reader routes, HR only. For
anyone else it is silently ignored and falls back to their own tag, so it can
never be used to read another team's terms.

Deliberately built on the real reader routes rather than a separate preview
endpoint -- a parallel path could drift from what employees actually get, which
would make the preview a lie."
```

---

## Task 6: Full verification

**Files:** none — verification only.

- [ ] **Step 1: Run the whole test suite**

Start `npm run dev` in another terminal first (`tests/api-integration.test.ts` needs it), then:

Run: `npm test`
Expected: all pass — Plan 1's 14 audience tests, Task 1's 8 coverage tests, and the pre-existing suites. Baseline before this plan was 371 passing; expect 379.

- [ ] **Step 2: Typecheck and build**

Run: `npx tsc --noEmit && npm run build`
Expected: both clean. The build runs `prisma migrate deploy` first — a no-op, since this plan adds no migration.

Do **not** run `npm run lint` — it is broken repo-wide (no ESLint config).

- [ ] **Step 3: Confirm no schema change crept in (C1)**

```bash
git diff main..HEAD --stat -- prisma/
```
Expected: **no output.** This plan must not touch the schema or add a migration. If it does, something was misdesigned — stop and report.

- [ ] **Step 4: Confirm no policy content was committed (C2)**

```bash
git log --all --oneline --name-only | grep -c "seed-handbook" || echo "0 — correct"
git diff main..HEAD | grep -icE "reimbursement|PKR [0-9]|profit pool" || echo "0 — correct"
```
Expected: `0` for both. Test fixtures use invented bodies (`BODY_A`), never real policy.

- [ ] **Step 5: End-to-end pass**

As HR: `/admin/handbook` shows 21 pages, 117 covered, 25 intentional, 5 needs-a-decision. Click a covered cell → the variant editor opens on that variant. Preview a body → markdown and tables render. Attempt an overlapping audience → rejected with a named-team error. Toggle an intentional gap → the grid count moves. `/handbook?previewTeam=NOBLE` → 15 tiles.

- [ ] **Step 6: Push the branch**

```bash
git push -u origin feat/company-handbook-admin
```

Do **not** merge to `main` without review — `main` auto-deploys on push.

---

## Notes for the implementer

- **The local `.env` points at production.** Every Prisma command hits the live database. The admin console writes real content — while testing, prefer creating a throwaway page over editing a seeded one, and delete it afterwards.
- **This plan adds no migration.** Plan 1's schema is sufficient. If you find yourself reaching for `prisma migrate`, stop and reconsider.
- **Do not "fix" the admin routes returning all bodies.** That is deliberate (C4). The leakage rule applies to the employee-facing routes, which Plan 1 tests and Task 5 must keep honest.
- **The 5 amber cells are the deliverable, not a bug.** Benefits × Indonesia and the four equipment cells are genuinely open questions for HR (spec §13.1). Do not resolve them by editing content.
- **If a deploy fails on a migrate advisory lock** (`P1002`), use Vercel → Redeploy, which runs a single build. Do not re-push repeatedly.
