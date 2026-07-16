# Company Handbook — Reader & Tagging Implementation Plan (Plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a working `/handbook` where every team member reads the policy content addressed to their team, and HR can assign a team to each user.

**Architecture:** A `HandbookPage` (the concept: slug, title, icon) owns many `HandbookVariant` rows (the content: markdown body + audience). A person carries one `User.teamTag`; resolution picks the single variant addressed to that tag. All resolution logic lives in **pure functions** in `lib/handbook/audience.ts` with no Prisma import, so it is exhaustively unit-testable — this repo has no DB-backed tests. Prisma is confined to `lib/handbook/queries.ts`.

**Tech Stack:** Next.js 15 App Router, Prisma + Neon Postgres, iron-session auth, Tailwind + shadcn/ui, framer-motion, react-markdown.

**Spec:** `docs/superpowers/specs/2026-07-16-company-handbook-design.md`

**Scope:** Plan 2 (`company-handbook-admin`) covers the coverage grid, the page editor and preview-as-team. Until Plan 2 lands, content is seeded by the script in Task 8 and edited via `prisma studio` if needed.

## Global Constraints

Every task's requirements implicitly include this section.

- **C1 — Additive only.** No existing table, column, row or behaviour is altered or removed. The generated migration SQL must contain only `CREATE TYPE`, `CREATE TABLE`, `CREATE INDEX` and `ALTER TABLE ... ADD COLUMN`. Any `DROP`, `RENAME`, or `ALTER COLUMN` is a defect — stop and report.
- **C2 — No policy content in git.** `Data-Quant/compass` is **public**. Rate tables, profit-sharing terms and benefit text never enter a committed file. The seed script (Task 8) is gitignored.
- **C3 — No employee PII in git.** No real names, positions, salary figures or determinations — in code, tests, comments or commit messages.
- **C4 — Audience filtering is server-side.** Never return all variants and filter on the client.
- **C5 — Withhold rather than guess.** Never render content on a maybe.
- **Do not use** `PageTransition`, `PageHeading` or `DataCard` — they have zero consumers. Follow the hand-rolled page pattern.
- **No `whileHover` / `whileTap`** — zero in the repo. Hover is CSS `transition-colors`.
- Neutral surfaces use CSS vars (`bg-card`, `text-muted-foreground`) with no `dark:`. Accent colours use explicit `dark:text-*-400` pairs.
- Branch: `feat/company-handbook`. Do **not** commit to `main` — `main` auto-deploys.
- Test command: `npx tsx --test tests/<file>.test.ts` for one file; `npm test` for all.

---

## File Structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` (modify) | `TeamTag` + `HandbookCategory` enums, 3 Handbook models, `User.teamTag` |
| `lib/handbook/teams.ts` (create) | Team constants + group expansion. No Prisma. |
| `lib/handbook/audience.ts` (create) | Pure resolution: variant selection, response shaping, overlap detection. No Prisma. |
| `lib/handbook/queries.ts` (create) | The only Prisma access for the Handbook. |
| `app/api/handbook/route.ts` (create) | GET hub — titles only, never bodies |
| `app/api/handbook/[slug]/route.ts` (create) | GET detail — exactly one body |
| `components/handbook/HandbookMarkdown.tsx` (create) | Sanitized markdown renderer |
| `components/handbook/HandbookTile.tsx` (create) | One MagicCard tile |
| `app/(evaluator)/handbook/page.tsx` (create) | Hub |
| `app/(evaluator)/handbook/[slug]/page.tsx` (create) | Detail |
| `lib/auth.ts` (modify) | Add `teamTag` to `SafeUser` + select |
| `components/layout/AppSidebar.tsx` (modify) | One nav item |
| `app/(hr)/admin/users/page.tsx` (modify) | Team dropdown |
| `app/api/admin/users/route.ts` (modify) | Accept `teamTag` on PUT/POST |
| `tests/handbook-audience.test.ts` (create) | Pure resolution tests incl. leakage |
| `scripts/seed-handbook.ts` (create, **gitignored**) | One-time content seed |

---

## Task 1: Schema, migration and session

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `lib/auth.ts:6-31` (SafeUser type), `lib/auth.ts:40-73` (select block)
- Create: `prisma/migrations/<timestamp>_add_handbook/migration.sql` (generated)

**Interfaces:**
- Consumes: nothing.
- Produces: Prisma types `TeamTag`, `HandbookCategory`, `HandbookPage`, `HandbookVariant`, `HandbookAudience`; `SafeUser.teamTag: TeamTag | null`.

- [ ] **Step 1: Add the enums and models to `prisma/schema.prisma`**

Append near the other enums (top of file, by `UserRole` at line 13):

```prisma
enum TeamTag {
  PAKISTAN
  MOROCCO
  COLOMBIA
  INDONESIA
  NOBLE
  THREE_E_PAKISTAN
  THREE_E_MOROCCO
}

enum HandbookCategory {
  START_HERE
  THE_COMPANY
  POLICIES
  BENEFITS_AND_REWARDS
  PERFORMANCE
  HOW_TO
}
```

Append at the end of the file:

```prisma
model HandbookPage {
  id                  String            @id @default(cuid())
  slug                String            @unique
  title               String
  icon                String
  category            HandbookCategory
  orderIndex          Int               @default(0)
  linkHref            String?
  linkLabel           String?
  isPublished         Boolean           @default(false)
  intentionalGapTeams TeamTag[]
  createdAt           DateTime          @default(now())
  updatedAt           DateTime          @updatedAt

  variants            HandbookVariant[]

  @@index([category, orderIndex])
}

model HandbookVariant {
  id           String             @id @default(cuid())
  pageId       String
  bodyMarkdown String             @db.Text
  orderIndex   Int                @default(0)
  createdAt    DateTime           @default(now())
  updatedAt    DateTime           @updatedAt

  page         HandbookPage       @relation(fields: [pageId], references: [id], onDelete: Cascade)
  audiences    HandbookAudience[]

  @@index([pageId])
}

model HandbookAudience {
  variantId String
  team      TeamTag

  variant   HandbookVariant @relation(fields: [variantId], references: [id], onDelete: Cascade)

  @@id([variantId, team])
  @@index([team])
}
```

- [ ] **Step 2: Add `teamTag` to the `User` model**

In `model User` (schema.prisma:263-373), add one line after `benefitCategoryId String?`:

```prisma
  teamTag           TeamTag?
```

Add nothing else to `User`. Do not touch existing fields.

- [ ] **Step 3: Generate the migration WITHOUT applying it**

⚠️ The local `.env` `DATABASE_URL` points at the **shared production Neon database**. `prisma migrate dev` would apply immediately. Use `--create-only`:

Run: `npx prisma migrate dev --create-only --name add_handbook`
Expected: `Prisma Migrate created the following migration without applying it`

- [ ] **Step 4: Read the generated SQL and verify it is additive (C1)**

Run: `cat prisma/migrations/*_add_handbook/migration.sql`

Expected — only these statement kinds:

```sql
CREATE TYPE "TeamTag" AS ENUM (...);
CREATE TYPE "HandbookCategory" AS ENUM (...);
ALTER TABLE "User" ADD COLUMN "teamTag" "TeamTag";
CREATE TABLE "HandbookPage" (...);
CREATE TABLE "HandbookVariant" (...);
CREATE TABLE "HandbookAudience" (...);
CREATE UNIQUE INDEX "HandbookPage_slug_key" ON "HandbookPage"("slug");
CREATE INDEX ...;
ALTER TABLE "HandbookVariant" ADD CONSTRAINT ... FOREIGN KEY ...;
ALTER TABLE "HandbookAudience" ADD CONSTRAINT ... FOREIGN KEY ...;
```

**GATE:** If the file contains `DROP`, `RENAME`, `ALTER COLUMN`, or any statement touching a table other than `User`, `HandbookPage`, `HandbookVariant`, `HandbookAudience` — **stop and report**. Do not apply.

Verify explicitly:

Run: `grep -icE "drop|rename|alter column" prisma/migrations/*_add_handbook/migration.sql`
Expected: `0`

- [ ] **Step 5: Apply the migration**

The change is additive-only and verified. `ADD COLUMN` with no default does not rewrite the table.

Run: `npx prisma migrate deploy`
Expected: `All migrations have been successfully applied.`

Then: `npx prisma generate`
Expected: `Generated Prisma Client`

- [ ] **Step 6: Add `teamTag` to `SafeUser`**

In `lib/auth.ts`, add to the `SafeUser` type after `benefitCategoryId: string | null`:

```ts
  teamTag: 'PAKISTAN' | 'MOROCCO' | 'COLOMBIA' | 'INDONESIA' | 'NOBLE' | 'THREE_E_PAKISTAN' | 'THREE_E_MOROCCO' | null
```

And in the `prisma.user.findUnique` select block, after `benefitCategoryId: true,`:

```ts
      teamTag: true,
```

- [ ] **Step 7: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations lib/auth.ts
git commit -m "feat: add Handbook schema and User.teamTag

Additive only: two new enums, three new tables, one nullable column.
Generated with --create-only and the SQL verified free of DROP/RENAME/
ALTER COLUMN before applying."
```

---

## Task 2: Pure audience resolution

**Files:**
- Create: `lib/handbook/teams.ts`
- Create: `lib/handbook/audience.ts`
- Test: `tests/handbook-audience.test.ts`

**Interfaces:**
- Consumes: `TeamTag` from `@prisma/client` (Task 1).
- Produces:
  - `ALL_TEAMS: TeamTag[]`, `INTERNAL_TEAMS: TeamTag[]`, `TEAM_LABELS: Record<TeamTag, string>`
  - `expandGroup(group: AudienceGroup): TeamTag[]` where `AudienceGroup = 'EVERYONE' | 'PLUTUS21_INTERNAL'`
  - `selectVariant(page: PageInput, tag: TeamTag | null): VariantInput | null`
  - `toHubResponse(pages: PageInput[], tag: TeamTag | null): HubResponse`
  - `toDetailResponse(page: PageInput, tag: TeamTag | null): DetailResponse | null`
  - `findAudienceOverlap(variants: VariantInput[]): TeamTag[]`
  - Types `PageInput`, `VariantInput`, `HubResponse`, `DetailResponse`

- [ ] **Step 1: Write `lib/handbook/teams.ts`**

```ts
import type { TeamTag } from '@prisma/client'

/** Every person-level team. Order is display order. */
export const ALL_TEAMS: readonly TeamTag[] = [
  'PAKISTAN',
  'MOROCCO',
  'COLOMBIA',
  'INDONESIA',
  'NOBLE',
  'THREE_E_PAKISTAN',
  'THREE_E_MOROCCO',
] as const

/** "Plutus21 Internal Team" — everyone except the two 3E teams. */
export const INTERNAL_TEAMS: readonly TeamTag[] = [
  'PAKISTAN',
  'MOROCCO',
  'COLOMBIA',
  'INDONESIA',
  'NOBLE',
] as const

export const TEAM_LABELS: Record<TeamTag, string> = {
  PAKISTAN: 'Pakistan Team',
  MOROCCO: 'Morocco Team',
  COLOMBIA: 'Colombia Team',
  INDONESIA: 'Indonesia Team',
  NOBLE: 'Noble Team',
  THREE_E_PAKISTAN: '3E Pakistan Team',
  THREE_E_MOROCCO: '3E Morocco Team',
}

/**
 * Derived groups. These are never stored on a user or a variant -- they expand
 * to the underlying teams at author time.
 */
export type AudienceGroup = 'EVERYONE' | 'PLUTUS21_INTERNAL'

export function expandGroup(group: AudienceGroup): TeamTag[] {
  return group === 'EVERYONE' ? [...ALL_TEAMS] : [...INTERNAL_TEAMS]
}
```

- [ ] **Step 2: Write the failing test**

Create `tests/handbook-audience.test.ts`:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import type { TeamTag } from '@prisma/client'
import { ALL_TEAMS, INTERNAL_TEAMS, expandGroup } from '../lib/handbook/teams'
import {
  selectVariant,
  toHubResponse,
  toDetailResponse,
  findAudienceOverlap,
  type PageInput,
} from '../lib/handbook/audience'

// ─── fixtures ────────────────────────────────────────────────────────────────
// Mirrors the real shape: one universal page, one multi-variant page.

const welcome: PageInput = {
  id: 'p1',
  slug: 'welcome',
  title: 'Welcome',
  icon: 'Hand',
  category: 'START_HERE',
  orderIndex: 0,
  linkHref: null,
  linkLabel: null,
  isPublished: true,
  variants: [
    { id: 'v1', bodyMarkdown: 'UNIVERSAL_BODY', orderIndex: 0, audiences: [...ALL_TEAMS] },
  ],
}

const leave: PageInput = {
  id: 'p2',
  slug: 'leave-policy',
  title: 'Leave Policy',
  icon: 'Calendar',
  category: 'POLICIES',
  orderIndex: 0,
  linkHref: '/leave',
  linkLabel: 'Apply for leave',
  isPublished: true,
  variants: [
    { id: 'v2', bodyMarkdown: 'INTERNAL_LEAVE_BODY', orderIndex: 0,
      audiences: ['PAKISTAN', 'MOROCCO', 'COLOMBIA', 'INDONESIA'] },
    { id: 'v3', bodyMarkdown: 'THREE_E_MA_LEAVE_BODY', orderIndex: 1, audiences: ['THREE_E_MOROCCO'] },
    { id: 'v4', bodyMarkdown: 'THREE_E_PK_LEAVE_BODY', orderIndex: 2, audiences: ['THREE_E_PAKISTAN'] },
    { id: 'v5', bodyMarkdown: 'NOBLE_LEAVE_BODY', orderIndex: 3, audiences: ['NOBLE'] },
  ],
}

const draft: PageInput = { ...welcome, id: 'p3', slug: 'draft-page', isPublished: false }

const pages = [welcome, leave, draft]

// ─── groups ──────────────────────────────────────────────────────────────────

test('expandGroup EVERYONE is all seven teams', () => {
  assert.deepEqual(expandGroup('EVERYONE').sort(), [...ALL_TEAMS].sort())
  assert.equal(expandGroup('EVERYONE').length, 7)
})

test('expandGroup PLUTUS21_INTERNAL excludes both 3E teams', () => {
  const internal = expandGroup('PLUTUS21_INTERNAL')
  assert.equal(internal.length, 5)
  assert.ok(!internal.includes('THREE_E_PAKISTAN'))
  assert.ok(!internal.includes('THREE_E_MOROCCO'))
})

// ─── selectVariant ───────────────────────────────────────────────────────────

test('selectVariant returns the variant addressed to the tag', () => {
  assert.equal(selectVariant(leave, 'PAKISTAN')?.bodyMarkdown, 'INTERNAL_LEAVE_BODY')
  assert.equal(selectVariant(leave, 'THREE_E_MOROCCO')?.bodyMarkdown, 'THREE_E_MA_LEAVE_BODY')
  assert.equal(selectVariant(leave, 'NOBLE')?.bodyMarkdown, 'NOBLE_LEAVE_BODY')
})

test('selectVariant returns null when no variant addresses the tag', () => {
  const pakistanOnly: PageInput = {
    ...welcome, id: 'p4', slug: 'travel-policy',
    variants: [{ id: 'v6', bodyMarkdown: 'TRAVEL', orderIndex: 0, audiences: ['PAKISTAN'] }],
  }
  assert.equal(selectVariant(pakistanOnly, 'NOBLE'), null)
})

test('untagged user gets a variant only when ONE variant covers all seven teams', () => {
  assert.equal(selectVariant(welcome, null)?.bodyMarkdown, 'UNIVERSAL_BODY')
})

test('untagged user gets NOTHING from a page that reaches seven teams across variants', () => {
  // Leave reaches all 7 collectively, but only by telling each team something
  // different. An untagged user has no team, so there is no right answer.
  assert.equal(selectVariant(leave, null), null)
})

// ─── hub ─────────────────────────────────────────────────────────────────────

test('hub excludes unpublished pages', () => {
  const slugs = toHubResponse(pages, 'PAKISTAN').pages.map((p) => p.slug)
  assert.ok(!slugs.includes('draft-page'))
})

test('hub for an untagged user is universal pages only, and flags untagged', () => {
  const res = toHubResponse(pages, null)
  assert.deepEqual(res.pages.map((p) => p.slug), ['welcome'])
  assert.equal(res.untagged, true)
})

test('hub for a tagged user includes pages addressed to them', () => {
  const res = toHubResponse(pages, 'THREE_E_PAKISTAN')
  assert.deepEqual(res.pages.map((p) => p.slug).sort(), ['leave-policy', 'welcome'])
  assert.equal(res.untagged, false)
})

// ─── leakage: the load-bearing guarantee ─────────────────────────────────────

test('LEAKAGE: hub response carries no bodies at all', () => {
  for (const tag of [...ALL_TEAMS, null] as (TeamTag | null)[]) {
    const json = JSON.stringify(toHubResponse(pages, tag))
    assert.ok(!json.includes('BODY'), `hub leaked a body for tag=${tag}`)
  }
})

test('LEAKAGE: detail response contains only the requesting team body', () => {
  const cases: Array<[TeamTag, string, string[]]> = [
    ['PAKISTAN', 'INTERNAL_LEAVE_BODY', ['THREE_E_MA_LEAVE_BODY', 'THREE_E_PK_LEAVE_BODY', 'NOBLE_LEAVE_BODY']],
    ['THREE_E_MOROCCO', 'THREE_E_MA_LEAVE_BODY', ['INTERNAL_LEAVE_BODY', 'THREE_E_PK_LEAVE_BODY', 'NOBLE_LEAVE_BODY']],
    ['NOBLE', 'NOBLE_LEAVE_BODY', ['INTERNAL_LEAVE_BODY', 'THREE_E_MA_LEAVE_BODY', 'THREE_E_PK_LEAVE_BODY']],
  ]
  for (const [tag, own, foreign] of cases) {
    const json = JSON.stringify(toDetailResponse(leave, tag))
    assert.ok(json.includes(own), `${tag} did not receive its own body`)
    for (const f of foreign) {
      assert.ok(!json.includes(f), `${tag} LEAKED ${f}`)
    }
  }
})

test('LEAKAGE: untagged user receives no team-specific body', () => {
  assert.equal(toDetailResponse(leave, null), null)
})

// ─── overlap ─────────────────────────────────────────────────────────────────

test('findAudienceOverlap returns teams claimed by more than one variant', () => {
  assert.deepEqual(findAudienceOverlap(leave.variants), [])
  const clashing = [
    { id: 'a', bodyMarkdown: 'x', orderIndex: 0, audiences: ['PAKISTAN', 'INDONESIA'] as TeamTag[] },
    { id: 'b', bodyMarkdown: 'y', orderIndex: 1, audiences: ['INDONESIA'] as TeamTag[] },
  ]
  assert.deepEqual(findAudienceOverlap(clashing), ['INDONESIA'])
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx tsx --test tests/handbook-audience.test.ts`
Expected: FAIL — `Cannot find module '../lib/handbook/audience'`

- [ ] **Step 4: Write `lib/handbook/audience.ts`**

```ts
import type { HandbookCategory, TeamTag } from '@prisma/client'
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
}

export type HubResponse = { pages: HubPage[]; untagged: boolean }

export type DetailResponse = {
  slug: string
  title: string
  icon: string
  category: HandbookCategory
  linkHref: string | null
  linkLabel: string | null
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx tsx --test tests/handbook-audience.test.ts`
Expected: PASS — 12 tests, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add lib/handbook/teams.ts lib/handbook/audience.ts tests/handbook-audience.test.ts
git commit -m "feat: add pure Handbook audience resolution

Resolution is pure over plain data so it is exhaustively testable without a
DB. The hub response carries no bodies at all, making hub leakage structurally
impossible; detail leakage is asserted per-team."
```

---

## Task 3: Team assignment in the admin user modal

**Files:**
- Create: `lib/handbook/queries.ts`
- Modify: `app/api/admin/users/route.ts` (PUT handler ~:422, POST ~:259)
- Modify: `app/(hr)/admin/users/page.tsx` (formData ~:149-159)

**Interfaces:**
- Consumes: `TEAM_LABELS`, `ALL_TEAMS` (Task 2); `TeamTag` (Task 1); `PageInput` (Task 2).
- Produces:
  - `teamTag` accepted on `POST` / `PUT /api/admin/users`, and returned by `GET`
  - `getAllPages(): Promise<PageInput[]>` in `lib/handbook/queries.ts` — published pages only
  - `getPageBySlug(slug: string): Promise<PageInput | null>` in `lib/handbook/queries.ts`

- [ ] **Step 1: Write `lib/handbook/queries.ts`** (the only Prisma access for the Handbook)

```ts
import { prisma } from '@/lib/db'
import type { PageInput } from './audience'

/** Loads every published page with its variants and audiences, shaped for the pure resolver. */
export async function getAllPages(): Promise<PageInput[]> {
  const rows = await prisma.handbookPage.findMany({
    where: { isPublished: true },
    orderBy: { orderIndex: 'asc' },
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
    variants: p.variants.map((v) => ({
      id: v.id,
      bodyMarkdown: v.bodyMarkdown,
      orderIndex: v.orderIndex,
      audiences: v.audiences.map((a) => a.team),
    })),
  }))
}

/** One page by slug, or null. */
export async function getPageBySlug(slug: string): Promise<PageInput | null> {
  const p = await prisma.handbookPage.findUnique({
    where: { slug },
    include: {
      variants: {
        orderBy: { orderIndex: 'asc' },
        include: { audiences: { select: { team: true } } },
      },
    },
  })
  if (!p) return null

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
```

- [ ] **Step 2: Accept `teamTag` in the users API**

In `app/api/admin/users/route.ts`, find the `PUT` handler's request destructuring and add `teamTag` alongside `benefitCategoryId`. Then in the `prisma.user.update` `data` object add:

```ts
      teamTag: teamTag ?? null,
```

Do the same in the `POST` handler's `prisma.user.create` `data`. Add a guard immediately after destructuring in both handlers:

```ts
    const VALID_TEAM_TAGS = [
      'PAKISTAN', 'MOROCCO', 'COLOMBIA', 'INDONESIA',
      'NOBLE', 'THREE_E_PAKISTAN', 'THREE_E_MOROCCO',
    ]
    if (teamTag != null && !VALID_TEAM_TAGS.includes(teamTag)) {
      return NextResponse.json({ error: 'Invalid teamTag' }, { status: 400 })
    }
```

Also add `teamTag: true` to the `select` in the `GET` handler so the list can display it.

- [ ] **Step 3: Add `teamTag` to the page's form state**

In `app/(hr)/admin/users/page.tsx`, add to the `User` type and to the `formData` initial state (~:149-159):

```ts
    teamTag: '',
```

When opening the edit modal, populate it: `teamTag: user.teamTag || ''`.

- [ ] **Step 4: Add the dropdown to the modal**

Place it directly after the existing Department field, matching the surrounding markup:

```tsx
<div>
  <Label htmlFor="teamTag">Team</Label>
  <select
    id="teamTag"
    value={formData.teamTag}
    onChange={(e) => setFormData({ ...formData, teamTag: e.target.value })}
    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
  >
    <option value="">— Not set —</option>
    <option value="PAKISTAN">Pakistan Team</option>
    <option value="MOROCCO">Morocco Team</option>
    <option value="COLOMBIA">Colombia Team</option>
    <option value="INDONESIA">Indonesia Team</option>
    <option value="NOBLE">Noble Team</option>
    <option value="THREE_E_PAKISTAN">3E Pakistan Team</option>
    <option value="THREE_E_MOROCCO">3E Morocco Team</option>
  </select>
  <p className="text-xs text-muted-foreground mt-1">
    Controls which Handbook content this person sees.
  </p>
</div>
```

Ensure the submit handler sends `teamTag: formData.teamTag || null`.

- [ ] **Step 5: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Verify manually**

Run: `npm run dev`, open `/admin/users`, edit any user, set Team, save, reopen.
Expected: the value persists. Leaving it "— Not set —" stores `null`.

- [ ] **Step 7: Commit**

```bash
git add lib/handbook/queries.ts app/api/admin/users/route.ts "app/(hr)/admin/users/page.tsx"
git commit -m "feat: let HR assign a team tag to each user

Adds the Team dropdown to the existing edit-user modal and accepts teamTag on
the users API, validated against the enum. No inference -- HR assigns."
```

---

## Task 4: Handbook API routes

**Files:**
- Create: `app/api/handbook/route.ts`
- Create: `app/api/handbook/[slug]/route.ts`

**Interfaces:**
- Consumes: `getAllPages`, `getPageBySlug` (Task 3); `toHubResponse`, `toDetailResponse` (Task 2); `getSession` (`lib/auth.ts`).
- Produces: `GET /api/handbook` → `HubResponse`; `GET /api/handbook/[slug]` → `DetailResponse` | 404.

- [ ] **Step 1: Write `app/api/handbook/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getAllPages } from '@/lib/handbook/queries'
import { toHubResponse } from '@/lib/handbook/audience'

export async function GET() {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Filtering happens here, on the server, against the session user's own tag.
    // Never return all variants for the client to filter -- teams differ on
    // compensation terms.
    const pages = await getAllPages()
    return NextResponse.json(toHubResponse(pages, user.teamTag))
  } catch (error) {
    console.error('Failed to fetch handbook hub:', error)
    return NextResponse.json({ error: 'Failed to fetch handbook' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Write `app/api/handbook/[slug]/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getPageBySlug } from '@/lib/handbook/queries'
import { toDetailResponse } from '@/lib/handbook/audience'

export async function GET(
  _request: Request,
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

    const detail = toDetailResponse(page, user.teamTag)
    if (!detail) {
      // The page exists but nothing addresses this user's team. A 404 is
      // correct -- an empty page would imply the content is missing.
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json(detail)
  } catch (error) {
    console.error('Failed to fetch handbook page:', error)
    return NextResponse.json({ error: 'Failed to fetch handbook page' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify the routes respond**

Run: `npm run dev`, then in another terminal:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/handbook
```
Expected: `401` (no session cookie) — proves the auth guard fires.

- [ ] **Step 5: Commit**

```bash
git add app/api/handbook
git commit -m "feat: add Handbook API routes

Both routes resolve against the session user's own teamTag server-side. The
hub returns titles only; detail returns exactly one body or 404."
```

---

## Task 5: Sanitized markdown renderer

**Files:**
- Create: `components/handbook/HandbookMarkdown.tsx`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `<HandbookMarkdown source={string} />`.

- [ ] **Step 1: Install the dependencies**

Run: `npm install react-markdown remark-gfm rehype-sanitize`
Expected: three packages added.

- [ ] **Step 2: Write the component**

`remark-gfm` is required — the source content contains tables. The sanitize schema is an allowlist: no raw HTML, no scripts, no iframes.

```tsx
'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'

/**
 * Handbook bodies are stored as authored and sanitized here, at render.
 *
 * This is a deliberate, documented exception to the repo's sanitize-at-ingest
 * posture (lib/sanitize.ts): markdown must survive round-tripping through the
 * editor, so stripping it on the way in would corrupt it. The allowlist below
 * is the compensating control.
 */
const schema = {
  ...defaultSchema,
  tagNames: [
    'h1', 'h2', 'h3', 'h4', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'del',
    'blockquote', 'code', 'pre', 'a', 'hr', 'br',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
  ],
  attributes: {
    ...defaultSchema.attributes,
    a: ['href', 'title'],
    th: ['align'],
    td: ['align'],
  },
  protocols: { ...defaultSchema.protocols, href: ['http', 'https', 'mailto'] },
}

export function HandbookMarkdown({ source }: { source: string }) {
  return (
    <div className="text-sm leading-relaxed text-muted-foreground space-y-4">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, schema]]}
        components={{
          h2: ({ children }) => (
            <h2 className="text-lg font-semibold text-foreground mt-8 mb-3">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold text-foreground mt-6 mb-2">{children}</h3>
          ),
          p: ({ children }) => <p>{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 space-y-1.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1.5">{children}</ol>,
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              className="text-primary underline underline-offset-2 hover:opacity-80 transition-opacity"
              target="_blank"
              rel="noopener noreferrer"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-border pl-4 italic">{children}</blockquote>
          ),
          // Tables must scroll inside their own container -- the page body must
          // never scroll horizontally.
          table: ({ children }) => (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm border-collapse">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="text-left font-medium text-foreground bg-muted/50 px-3 py-2 border-b border-border">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 border-b border-border align-top">{children}</td>
          ),
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/handbook/HandbookMarkdown.tsx package.json package-lock.json
git commit -m "feat: add sanitized Handbook markdown renderer

react-markdown + remark-gfm (the content has tables) + rehype-sanitize on a
tight allowlist. Documented exception to sanitize-at-ingest: markdown must
survive round-tripping through the editor, so it is sanitized at render."
```

---

## Task 6: The hub page

**Files:**
- Create: `components/handbook/HandbookTile.tsx`
- Create: `app/(evaluator)/handbook/page.tsx`
- Modify: `components/layout/AppSidebar.tsx:63-75` (EMPLOYEE_SIDEBAR)

**Interfaces:**
- Consumes: `GET /api/handbook` (Task 4); `useLayoutUser` (`components/layout/SidebarLayout.tsx:40`).
- Produces: the `/handbook` route.

- [ ] **Step 1: Add the nav item**

In `components/layout/AppSidebar.tsx`, import `BookOpen` from `lucide-react` and add to `EMPLOYEE_SIDEBAR.items`, after `Office`:

```ts
    { label: 'Handbook', href: '/handbook', icon: BookOpen },
```

- [ ] **Step 2: Write the tile**

```tsx
'use client'

import Link from 'next/link'
import * as Icons from 'lucide-react'
import { MagicCard } from '@/components/magicui/magic-card'

type Props = {
  slug: string
  title: string
  icon: string
  linkLabel: string | null
}

export function HandbookTile({ slug, title, icon, linkLabel }: Props) {
  // Icon names come from a controlled seed, but fall back rather than crash.
  const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[icon] ?? Icons.FileText

  return (
    <Link href={`/handbook/${slug}`} className="block h-full">
      <MagicCard className="h-full flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-primary" />
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
        </div>
        {linkLabel && (
          <p className="text-xs text-muted-foreground">{linkLabel} →</p>
        )}
      </MagicCard>
    </Link>
  )
}
```

- [ ] **Step 3: Write the hub**

Uses the repo's standard page shape: `p-6 sm:p-8 max-w-7xl mx-auto`, a hand-rolled header, the local `stagger` constant, `BackgroundBeams` (as `login/page.tsx` does), `font-display` + `gradient-text` (as `dashboard/page.tsx` does).

```tsx
'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertCircle } from 'lucide-react'
import { BackgroundBeams } from '@/components/aceternity/background-beams'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { EmptyState } from '@/components/composed/EmptyState'
import { HandbookTile } from '@/components/handbook/HandbookTile'
import { useLayoutUser } from '@/components/layout/SidebarLayout'
import { TEAM_LABELS } from '@/lib/handbook/teams'

const stagger = {
  container: { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } },
  item: { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } },
}

const CATEGORY_LABELS: Record<string, string> = {
  START_HERE: 'Start here',
  THE_COMPANY: 'The company',
  POLICIES: 'Policies',
  BENEFITS_AND_REWARDS: 'Benefits & rewards',
  PERFORMANCE: 'Performance',
  HOW_TO: 'How-to',
}

const CATEGORY_ORDER = [
  'START_HERE', 'THE_COMPANY', 'POLICIES',
  'BENEFITS_AND_REWARDS', 'PERFORMANCE', 'HOW_TO',
]

type HubPage = {
  slug: string
  title: string
  icon: string
  category: string
  orderIndex: number
  linkHref: string | null
  linkLabel: string | null
}

export default function HandbookPage() {
  const user = useLayoutUser()
  const [pages, setPages] = useState<HubPage[]>([])
  const [untagged, setUntagged] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/handbook')
      .then((r) => r.json())
      .then((d) => {
        setPages(d.pages || [])
        setUntagged(Boolean(d.untagged))
      })
      .catch(() => setPages([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingScreen />

  const teamLabel =
    user?.teamTag ? TEAM_LABELS[user.teamTag as keyof typeof TEAM_LABELS] : null

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-card border border-border bg-card p-8 mb-8"
      >
        <BackgroundBeams className="opacity-40 dark:opacity-20" />
        <div className="relative">
          {teamLabel && (
            <div className="inline-flex items-center gap-1.5 border border-border rounded-badge px-2.5 py-1 mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              <span className="text-xs font-medium text-muted-foreground">{teamLabel}</span>
            </div>
          )}
          <h1 className="text-2xl sm:text-3xl font-display font-light tracking-tight text-foreground">
            The <span className="gradient-text">Handbook</span>
          </h1>
          <p className="text-muted-foreground mt-1">
            Policies, benefits, and how we work together.
          </p>
        </div>
      </motion.div>

      {untagged && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 mb-8"
        >
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="text-sm font-medium text-foreground">Your team hasn&apos;t been set yet</p>
            <p className="text-sm text-muted-foreground">
              Some sections are hidden until it is. Contact HR to get set up.
            </p>
          </div>
        </motion.div>
      )}

      {pages.length === 0 ? (
        <EmptyState
          icon={<AlertCircle className="h-10 w-10" />}
          title="Nothing here yet"
          description="No handbook content has been published for your team."
        />
      ) : (
        CATEGORY_ORDER.filter((c) => pages.some((p) => p.category === c)).map((category) => (
          <div key={category} className="mb-10">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-4">
              {CATEGORY_LABELS[category]}
            </p>
            <motion.div
              variants={stagger.container}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {pages
                .filter((p) => p.category === category)
                .map((p) => (
                  <motion.div key={p.slug} variants={stagger.item}>
                    <HandbookTile
                      slug={p.slug}
                      title={p.title}
                      icon={p.icon}
                      linkLabel={p.linkLabel}
                    />
                  </motion.div>
                ))}
            </motion.div>
          </div>
        ))
      )}
    </div>
  )
}
```

- [ ] **Step 4: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Verify visually (both themes)**

Run: `npm run dev`, log in, open `/handbook`.
Expected: with no content seeded yet, the hero renders with beams and the empty state shows. Toggle light/dark — both must be legible, and the page body must not scroll horizontally.

- [ ] **Step 6: Commit**

```bash
git add components/handbook/HandbookTile.tsx "app/(evaluator)/handbook/page.tsx" components/layout/AppSidebar.tsx
git commit -m "feat: add Handbook hub

Uses only existing app idioms: BackgroundBeams (as login does), font-display +
gradient-text (as dashboard does), MagicCard tiles, and the standard stagger
entrance. Shows the untagged banner when the user has no team."
```

---

## Task 7: The detail page

**Files:**
- Create: `app/(evaluator)/handbook/[slug]/page.tsx`

**Interfaces:**
- Consumes: `GET /api/handbook/[slug]` (Task 4); `HandbookMarkdown` (Task 5).
- Produces: the `/handbook/[slug]` route.

Detail pages stay calm — no beams, no glow. Standard `Card` + `CardContent p-6`, so nothing competes with the text.

- [ ] **Step 1: Write the page**

```tsx
'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowLeft, FileQuestion } from 'lucide-react'
import * as Icons from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { EmptyState } from '@/components/composed/EmptyState'
import { ShimmerButton } from '@/components/magicui/shimmer-button'
import { HandbookMarkdown } from '@/components/handbook/HandbookMarkdown'

type Detail = {
  slug: string
  title: string
  icon: string
  category: string
  linkHref: string | null
  linkLabel: string | null
  bodyMarkdown: string
}

export default function HandbookDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/handbook/${slug}`)
      .then(async (r) => {
        if (!r.ok) {
          setNotFound(true)
          return null
        }
        return r.json()
      })
      .then((d) => d && setDetail(d))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [slug])

  if (loading) return <LoadingScreen />

  if (notFound || !detail) {
    return (
      <div className="p-6 sm:p-8 max-w-4xl mx-auto">
        <EmptyState
          icon={<FileQuestion className="h-10 w-10" />}
          title="Not available for your team"
          description="This section either doesn't exist or isn't part of your team's handbook."
          action={
            <Link
              href="/handbook"
              className="text-sm text-primary underline underline-offset-2"
            >
              Back to the Handbook
            </Link>
          }
        />
      </div>
    )
  }

  const Icon =
    (Icons as unknown as Record<string, Icons.LucideIcon>)[detail.icon] ?? Icons.FileText

  return (
    <div className="p-6 sm:p-8 max-w-4xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <Link
          href="/handbook"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          The Handbook
        </Link>
        <h1 className="text-2xl sm:text-3xl font-display font-light tracking-tight text-foreground flex items-center gap-3">
          <Icon className="h-7 w-7 text-primary" />
          {detail.title}
        </h1>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <Card>
          <CardContent className="p-6 sm:p-8">
            <HandbookMarkdown source={detail.bodyMarkdown} />

            {detail.linkHref && detail.linkLabel && (
              <div className="mt-8 pt-6 border-t border-border">
                <Link href={detail.linkHref}>
                  <ShimmerButton>{detail.linkLabel}</ShimmerButton>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Verify the 404 path**

Run: `npm run dev`, open `/handbook/does-not-exist`.
Expected: the "Not available for your team" empty state — **not** a blank page or a crash.

- [ ] **Step 4: Commit**

```bash
git add "app/(evaluator)/handbook/[slug]/page.tsx"
git commit -m "feat: add Handbook detail page

Calm reading surface -- standard Card + CardContent, no beams. Pages carrying
a linkHref render a ShimmerButton CTA into the live module instead of
restating the process."
```

---

## Task 8: Content seed script (gitignored)

**Files:**
- Create: `scripts/seed-handbook.ts` — **gitignored, never committed (C2)**
- Modify: `.gitignore`

**Interfaces:**
- Consumes: Prisma models (Task 1); `ALL_TEAMS`, `INTERNAL_TEAMS` (Task 2).
- Produces: 21 pages / 31 variants in the database.

**Source of truth:** `Company Dashboard Migration_ Notion to Compass.docx` in the repo root (untracked). Transcribe its sections into markdown. **Reproduce the document's tags exactly — do not widen any audience** (spec §3.3). Where the source is silent, stay silent.

> **Why the bodies are not inline in this plan.** Every other task in this plan carries complete code. This one cannot: the bodies are the policy content itself — commute reimbursement bands, profit-sharing terms, benefit entitlements — and this plan is a **committed file in a public repo** (C2). Writing them here would leak exactly what the DB-backed design exists to protect. The `<transcribe X>` markers are therefore pointers to named, existing sections of the source document, not "TBD". Each marker names its section heading verbatim; the manifest below fixes every slug, icon, category, order, link and audience, so the only thing the implementer supplies is prose they can copy from the `.docx` open beside them.
>
> **Extracting the .docx:** it is a zip. `word/document.xml` holds the text; paragraphs are `<w:p>`, table rows `<w:tr>`, cells `<w:tc>`. Section headings appear as plain runs (`WELCOME MESSAGE`, `LEAVE POLICY`, …) each followed by a `Tag:` line naming its audience — those `Tag:` lines are the authority for the audiences already encoded in the manifest below. Verify each transcription against its `Tag:` line as you go.

- [ ] **Step 1: Gitignore the script BEFORE writing it (C2)**

Add to `.gitignore`:

```
# Handbook seed carries policy content - never commit (public repo)
/scripts/seed-handbook.ts
```

Verify: `git check-ignore -v scripts/seed-handbook.ts`
Expected: a line naming `.gitignore`. **If this prints nothing, stop** — the file is not ignored and must not be created yet.

- [ ] **Step 2: Write the script skeleton with the page manifest**

The audiences below are the approved baseline (spec §3.3). Bodies are transcribed from the source document.

```ts
/**
 * ONE-TIME Handbook content seed. GITIGNORED -- carries policy content and this
 * repo is public. Idempotent: upserts by slug and replaces variants.
 *
 * Run: npx tsx scripts/seed-handbook.ts
 */
import { PrismaClient, type TeamTag, type HandbookCategory } from '@prisma/client'

const prisma = new PrismaClient()

const ALL: TeamTag[] = ['PAKISTAN', 'MOROCCO', 'COLOMBIA', 'INDONESIA', 'NOBLE', 'THREE_E_PAKISTAN', 'THREE_E_MOROCCO']
const INTERNAL: TeamTag[] = ['PAKISTAN', 'MOROCCO', 'COLOMBIA', 'INDONESIA', 'NOBLE']

type Seed = {
  slug: string
  title: string
  icon: string
  category: HandbookCategory
  orderIndex: number
  linkHref?: string
  linkLabel?: string
  intentionalGapTeams?: TeamTag[]
  variants: { audiences: TeamTag[]; body: string }[]
}

const PAGES: Seed[] = [
  // ─── Start here ────────────────────────────────────────────────────────────
  { slug: 'welcome', title: 'Welcome', icon: 'Hand', category: 'START_HERE', orderIndex: 0,
    variants: [{ audiences: ALL, body: `<transcribe WELCOME MESSAGE>` }] },
  { slug: 'vision-and-values', title: 'Vision & Values', icon: 'Compass', category: 'START_HERE', orderIndex: 1,
    variants: [{ audiences: ALL, body: `<transcribe VISION AND VALUES>` }] },

  // ─── The company ───────────────────────────────────────────────────────────
  { slug: 'our-offices', title: 'Our Offices', icon: 'Building2', category: 'THE_COMPANY', orderIndex: 0,
    variants: [{ audiences: ALL, body: `<transcribe OUR OFFICES incl. the table>` }] },
  { slug: 'our-businesses', title: 'Our Businesses', icon: 'Briefcase', category: 'THE_COMPANY', orderIndex: 1,
    variants: [{ audiences: ALL, body: `<transcribe OUR BUSINESSES>` }] },

  // ─── Policies ──────────────────────────────────────────────────────────────
  { slug: 'leave-policy', title: 'Leave Policy', icon: 'CalendarDays', category: 'POLICIES', orderIndex: 0,
    linkHref: '/leave', linkLabel: 'Apply for leave',
    variants: [
      { audiences: ['PAKISTAN', 'MOROCCO', 'COLOMBIA', 'INDONESIA'], body: `<transcribe LEAVE POLICY (internal)>` },
      { audiences: ['THREE_E_MOROCCO'], body: `<transcribe LEAVE POLICY (3E Morocco)>` },
      { audiences: ['THREE_E_PAKISTAN'], body: `<transcribe LEAVE POLICY (3E Pakistan)>` },
      { audiences: ['NOBLE'], body: `<transcribe LEAVE POLICY (Noble)>` },
    ] },
  { slug: 'travel-policy', title: 'Travel Policy', icon: 'Car', category: 'POLICIES', orderIndex: 1,
    intentionalGapTeams: ['MOROCCO', 'COLOMBIA', 'INDONESIA', 'NOBLE', 'THREE_E_PAKISTAN', 'THREE_E_MOROCCO'],
    variants: [{ audiences: ['PAKISTAN'], body: `<transcribe TRAVEL POLICY incl. the rate table>` }] },
  { slug: 'core-hours-policy', title: 'Core Hours Policy', icon: 'Clock', category: 'POLICIES', orderIndex: 2,
    variants: [
      { audiences: ['PAKISTAN', 'COLOMBIA', 'MOROCCO'], body: `<transcribe CORE HOURS (Pk/Co/Ma)>` },
      { audiences: ['THREE_E_MOROCCO'], body: `<transcribe CORE HOURS (3E Morocco)>` },
      { audiences: ['THREE_E_PAKISTAN'], body: `<transcribe CORE HOURS (3E Pakistan)>` },
      { audiences: ['NOBLE'], body: `<transcribe CORE HOURS (Noble)>` },
      { audiences: ['INDONESIA'], body: `<transcribe CORE HOURS (Indonesia)>` },
    ] },
  { slug: 'zero-tolerance-policy', title: 'Zero Tolerance Policy', icon: 'ShieldAlert', category: 'POLICIES', orderIndex: 3,
    variants: [{ audiences: ALL, body: `<transcribe ZERO TOLERANCE POLICY>` }] },
  { slug: 'social-media-policy', title: 'Social Media Policy', icon: 'Share2', category: 'POLICIES', orderIndex: 4,
    variants: [{ audiences: ALL, body: `<transcribe SOCIAL MEDIA POLICY>` }] },
  { slug: 'inventions-and-confidentiality', title: 'Inventions & Confidentiality', icon: 'Lock', category: 'POLICIES', orderIndex: 5,
    variants: [{ audiences: ALL, body: `<transcribe INVENTIONS & CONFIDENTIALITY>` }] },
  { slug: 'termination-of-employment', title: 'Termination of Employment', icon: 'LogOut', category: 'POLICIES', orderIndex: 6,
    variants: [{ audiences: ALL, body: `<transcribe TERMINATION OF EMPLOYMENT>` }] },
  { slug: 'company-equipment-policy', title: 'Company Equipment Policy', icon: 'Laptop', category: 'POLICIES', orderIndex: 7,
    linkHref: '/device-support', linkLabel: 'Report a device issue',
    // Indonesia + Noble deliberately left UNREVIEWED, not intentional -- the
    // source contradicts itself (both teams are issued equipment). HR decides.
    variants: [{ audiences: ['PAKISTAN', 'MOROCCO', 'COLOMBIA', 'THREE_E_PAKISTAN', 'THREE_E_MOROCCO'],
                 body: `<transcribe COMPANY EQUIPMENT POLICY>` }] },
  { slug: 'maternity-leave-policy', title: 'Maternity Leave Policy', icon: 'Baby', category: 'POLICIES', orderIndex: 8,
    intentionalGapTeams: ['INDONESIA', 'NOBLE', 'THREE_E_PAKISTAN', 'THREE_E_MOROCCO'],
    variants: [{ audiences: ['PAKISTAN', 'MOROCCO', 'COLOMBIA'], body: `<transcribe MATERNITY LEAVE POLICY + guide>` }] },
  { slug: 'principles-of-conduct', title: 'Principles of Conduct', icon: 'Scale', category: 'POLICIES', orderIndex: 9,
    intentionalGapTeams: ['NOBLE', 'THREE_E_PAKISTAN', 'THREE_E_MOROCCO'],
    variants: [
      { audiences: ['PAKISTAN', 'MOROCCO'], body: `<transcribe PRINCIPLES OF CONDUCT (full)>` },
      { audiences: ['COLOMBIA', 'INDONESIA'], body: `<transcribe PRINCIPLE OF CONDUCT (short)>` },
    ] },

  // ─── Benefits & rewards ────────────────────────────────────────────────────
  { slug: 'benefits', title: 'Benefits', icon: 'Gift', category: 'BENEFITS_AND_REWARDS', orderIndex: 0,
    linkHref: '/benefits', linkLabel: 'View your benefits',
    // Indonesia left UNREVIEWED (source has no Indonesia benefits); 3E intentional.
    intentionalGapTeams: ['THREE_E_PAKISTAN', 'THREE_E_MOROCCO'],
    variants: [
      { audiences: ['PAKISTAN'], body: `<transcribe BENEFITS FOR PAKISTAN TEAM intro>` },
      { audiences: ['MOROCCO', 'COLOMBIA'], body: `<transcribe BENEFITS FOR GLOBAL TEAM intro>` },
      { audiences: ['NOBLE'], body: `<transcribe BENEFITS FOR NOBLE TEAM intro>` },
    ] },
  { slug: 'profit-sharing-policy', title: 'Profit Sharing', icon: 'TrendingUp', category: 'BENEFITS_AND_REWARDS', orderIndex: 1,
    intentionalGapTeams: ['INDONESIA', 'NOBLE', 'THREE_E_PAKISTAN', 'THREE_E_MOROCCO'],
    variants: [{ audiences: ['PAKISTAN', 'MOROCCO', 'COLOMBIA'], body: `<transcribe PROFIT SHARING POLICY>` }] },

  // ─── Performance ───────────────────────────────────────────────────────────
  { slug: 'team-reviews', title: 'Team Reviews', icon: 'Users', category: 'PERFORMANCE', orderIndex: 0,
    intentionalGapTeams: ['THREE_E_PAKISTAN', 'THREE_E_MOROCCO'],
    variants: [{ audiences: INTERNAL, body: `<transcribe TEAM REVIEWS>` }] },
  { slug: 'performance-evaluation', title: 'Performance Evaluation', icon: 'ClipboardCheck', category: 'PERFORMANCE', orderIndex: 1,
    linkHref: '/evaluations', linkLabel: 'Go to evaluations',
    intentionalGapTeams: ['THREE_E_PAKISTAN', 'THREE_E_MOROCCO'],
    variants: [{ audiences: INTERNAL, body: `<transcribe PERFORMANCE EVALUATION>` }] },

  // ─── How-to ────────────────────────────────────────────────────────────────
  { slug: 'sop-faulty-equipment', title: 'SOP: Faulty Equipment', icon: 'Wrench', category: 'HOW_TO', orderIndex: 0,
    linkHref: '/device-support', linkLabel: 'Raise a request',
    // Indonesia + Noble deliberately left UNREVIEWED -- see company-equipment-policy.
    variants: [{ audiences: ['PAKISTAN', 'MOROCCO', 'COLOMBIA', 'THREE_E_PAKISTAN', 'THREE_E_MOROCCO'],
                 body: `<transcribe SOP: Replacement of Faulty Equipment>` }] },
  { slug: 'approved-vendors', title: 'Approved Vendors', icon: 'Store', category: 'HOW_TO', orderIndex: 1,
    variants: [{ audiences: ALL, body: `<transcribe LIST OF APPROVED VENDORS incl. the table>` }] },
  { slug: 'discord-channels-guide', title: 'Discord Channels Guide', icon: 'MessageSquare', category: 'HOW_TO', orderIndex: 2,
    intentionalGapTeams: ['THREE_E_PAKISTAN', 'THREE_E_MOROCCO'],
    variants: [{ audiences: INTERNAL, body: `<transcribe DISCORD CHANNELS GUIDE incl. the table>` }] },
]

async function main() {
  for (const p of PAGES) {
    const page = await prisma.handbookPage.upsert({
      where: { slug: p.slug },
      create: {
        slug: p.slug, title: p.title, icon: p.icon, category: p.category,
        orderIndex: p.orderIndex, linkHref: p.linkHref ?? null, linkLabel: p.linkLabel ?? null,
        isPublished: true, intentionalGapTeams: p.intentionalGapTeams ?? [],
      },
      update: {
        title: p.title, icon: p.icon, category: p.category, orderIndex: p.orderIndex,
        linkHref: p.linkHref ?? null, linkLabel: p.linkLabel ?? null,
        isPublished: true, intentionalGapTeams: p.intentionalGapTeams ?? [],
      },
    })

    // Replace variants wholesale -- cascade removes their audiences.
    await prisma.handbookVariant.deleteMany({ where: { pageId: page.id } })
    for (const [i, v] of p.variants.entries()) {
      await prisma.handbookVariant.create({
        data: {
          pageId: page.id,
          bodyMarkdown: v.body,
          orderIndex: i,
          audiences: { create: v.audiences.map((team) => ({ team })) },
        },
      })
    }
    console.log(`  ${p.slug.padEnd(32)} ${p.variants.length} variant(s)`)
  }

  console.log(`\nSeeded ${PAGES.length} pages / ${PAGES.reduce((n, p) => n + p.variants.length, 0)} variants`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
```

- [ ] **Step 3: Transcribe the real content**

Replace every `<transcribe ...>` placeholder with the actual section text from the `.docx`, converted to markdown. Tables become GFM tables (`| a | b |`). **The script must contain no `<transcribe` markers when you are done.**

Verify: `grep -c "<transcribe" scripts/seed-handbook.ts`
Expected: `0`

- [ ] **Step 4: Confirm the script is still ignored before running**

Run: `git status --short scripts/seed-handbook.ts`
Expected: **no output**. If the file appears, it is tracked — `git rm --cached` it and fix `.gitignore` before proceeding.

- [ ] **Step 5: Run the seed**

Run: `npx tsx scripts/seed-handbook.ts`
Expected: 21 lines, then `Seeded 21 pages / 31 variants`.

- [ ] **Step 6: Verify audiences and counts**

```bash
npx tsx -e "
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
const pages = await p.handbookPage.findMany({ include: { variants: { include: { audiences: true } } } })
console.log('pages', pages.length)
console.log('variants', pages.reduce((n,x)=>n+x.variants.length,0))
const TEAMS = ['PAKISTAN','MOROCCO','COLOMBIA','INDONESIA','NOBLE','THREE_E_PAKISTAN','THREE_E_MOROCCO']
for (const t of TEAMS) {
  const n = pages.filter(pg => pg.variants.some(v => v.audiences.some(a => a.team === t))).length
  console.log(' ', t.padEnd(18), n)
}
// overlap check: no team may be claimed twice on one page
for (const pg of pages) {
  const seen = new Set(), dup = new Set()
  for (const v of pg.variants) for (const a of v.audiences) { if (seen.has(a.team)) dup.add(a.team); seen.add(a.team) }
  if (dup.size) console.log('  OVERLAP', pg.slug, [...dup])
}
await p.\$disconnect()
"
```

Expected exactly:
```
pages 21
variants 31
  PAKISTAN           21
  MOROCCO            20
  COLOMBIA           20
  INDONESIA          15
  NOBLE              15
  THREE_E_PAKISTAN   13
  THREE_E_MOROCCO    13
```
and **no `OVERLAP` lines**. If any count differs, an audience was transcribed wrongly — fix before continuing.

- [ ] **Step 7: Add benefit seeding to the same script (spec §9.1)**

The Handbook's Benefits tile links to `/benefits`, which reads `Benefit` rows via the user's `benefitCategoryId`. Those rows do not exist yet — the category scaffold shipped empty. Seeding them here is what makes that link lead somewhere.

**Additive only (C1):** one new category row, and `Benefit` inserts into categories that currently hold zero benefits. No existing `BenefitCategory` row is modified.

**Which categories get content** — from spec §9.1, do not improvise:

| Category | `region` / `employeeType` | Source section | Action |
|---|---|---|---|
| `Pakistan - Plutus21 Employee` | Pakistan / Plutus21 Employee | "BENEFITS FOR PAKISTAN TEAM" | seed (11 benefits) |
| `Morocco - Plutus21 Employee` | Morocco / Plutus21 Employee | "BENEFITS FOR GLOBAL TEAM" | seed (9 benefits) |
| `Colombia - Plutus21 Employee` | Colombia / Plutus21 Employee | "BENEFITS FOR GLOBAL TEAM" | seed (same 9) |
| `Noble - Plutus21 Employee` | Noble / Plutus21 Employee | "BENEFITS FOR NOBLE TEAM" | **create category**, seed (7) |
| `Indonesia - Plutus21 Employee` | — | *(none in source)* | leave empty |
| `* - Plutus21 IC` (×4) | — | *(none in source)* | leave empty |

Append to `scripts/seed-handbook.ts`:

```ts
type BenefitSeed = { categoryName: string; benefits: { title: string; description: string }[] }

// Transcribe each benefit's heading + paragraph from the named source section.
// Titles and descriptions are policy content -- they live only in this
// gitignored file, never in the plan or any committed file (C2).
const PAKISTAN_BENEFITS: BenefitSeed['benefits'] = [
  // <transcribe the 11 benefits under "BENEFITS FOR PAKISTAN TEAM">
]
const GLOBAL_BENEFITS: BenefitSeed['benefits'] = [
  // <transcribe the 9 benefits under "BENEFITS FOR GLOBAL TEAM">
]
const NOBLE_BENEFITS: BenefitSeed['benefits'] = [
  // <transcribe the 7 benefits under "BENEFITS FOR NOBLE TEAM">
]

const BENEFIT_SEEDS: BenefitSeed[] = [
  { categoryName: 'Pakistan - Plutus21 Employee', benefits: PAKISTAN_BENEFITS },
  { categoryName: 'Morocco - Plutus21 Employee', benefits: GLOBAL_BENEFITS },
  { categoryName: 'Colombia - Plutus21 Employee', benefits: GLOBAL_BENEFITS },
  { categoryName: 'Noble - Plutus21 Employee', benefits: NOBLE_BENEFITS },
]

async function seedBenefits() {
  // The Noble category does not exist -- the scaffold shipped without it.
  await prisma.benefitCategory.upsert({
    where: { name: 'Noble - Plutus21 Employee' },
    create: { name: 'Noble - Plutus21 Employee', region: 'Noble', employeeType: 'Plutus21 Employee', isActive: true },
    update: {},
  })

  for (const seed of BENEFIT_SEEDS) {
    const category = await prisma.benefitCategory.findUnique({ where: { name: seed.categoryName } })
    if (!category) {
      console.error(`  MISSING CATEGORY: ${seed.categoryName} -- skipped`)
      continue
    }

    // Refuse to touch a category HR has already populated. This script seeds
    // empty categories only; it must never clobber real HR data.
    const existing = await prisma.benefit.count({ where: { categoryId: category.id } })
    if (existing > 0) {
      console.log(`  ${seed.categoryName.padEnd(34)} SKIPPED -- already has ${existing} benefit(s)`)
      continue
    }

    for (const [i, b] of seed.benefits.entries()) {
      await prisma.benefit.create({
        data: { categoryId: category.id, title: b.title, description: b.description, orderIndex: i, isActive: true },
      })
    }
    console.log(`  ${seed.categoryName.padEnd(34)} ${seed.benefits.length} benefit(s)`)
  }
}
```

Call it from `main()`, after the page loop:

```ts
  console.log('\nBenefits:')
  await seedBenefits()
```

- [ ] **Step 8: Transcribe the benefits, then run and verify**

Replace the three `<transcribe ...>` comments with the real benefit arrays.

Verify no markers remain: `grep -c "<transcribe" scripts/seed-handbook.ts`
Expected: `0`

Run: `npx tsx scripts/seed-handbook.ts`
Expected, under `Benefits:`:
```
  Pakistan - Plutus21 Employee       11 benefit(s)
  Morocco - Plutus21 Employee        9 benefit(s)
  Colombia - Plutus21 Employee       9 benefit(s)
  Noble - Plutus21 Employee          7 benefit(s)
```

Confirm the untouched categories are still empty and nothing existing changed:

```bash
npx tsx -e "
import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
const cats = await p.benefitCategory.findMany({ include: { _count: { select: { benefits: true, users: true } } }, orderBy: { name: 'asc' } })
console.log('categories', cats.length, '(expected 9)')
for (const c of cats) console.log(' ', c.name.padEnd(34), 'benefits=' + c._count.benefits, 'users=' + c._count.users)
await p.\$disconnect()
"
```
Expected: 9 categories. The four seeded show their counts; `Indonesia - Plutus21 Employee` and all four `- Plutus21 IC` categories show `benefits=0`. **User counts must be unchanged** — this script assigns nobody to a category.

- [ ] **Step 9: Verify end-to-end in the browser**

Run: `npm run dev`. Set your own user's Team to `PAKISTAN` via `/admin/users`, open `/handbook`.
Expected: 21 tiles across 6 categories, no untagged banner. Open Leave Policy — the internal variant renders, with an "Apply for leave" button. Set your Team to `THREE_E_PAKISTAN`, reload: 13 tiles, and Leave Policy shows the 3E Pakistan text. Set Team to "— Not set —": 9 tiles and the amber banner.

Check a table renders and scrolls: open Approved Vendors and narrow the window — the table must scroll inside its own container while the page body does not scroll horizontally.

- [ ] **Step 10: Commit (the .gitignore change only)**

```bash
git add .gitignore
git status --short   # confirm scripts/seed-handbook.ts is NOT listed
git commit -m "chore: gitignore the Handbook content seed script

The script carries policy content and this repo is public."
```

---

## Task 9: Full verification

**Files:** none — verification only.

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: all pass, including the 12 in `tests/handbook-audience.test.ts`. Note `tests/api-integration.test.ts` needs a dev server; if it fails for that reason, start one and re-run.

- [ ] **Step 2: Typecheck and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds. ⚠️ This runs `prisma migrate deploy` first — expected to be a no-op since Task 1 applied it.

- [ ] **Step 4: Confirm no policy content is staged for commit (C2)**

```bash
git log --oneline origin/main..HEAD
git diff origin/main..HEAD --stat
```
Expected: `scripts/seed-handbook.ts` appears in **neither**. If it does — stop, `git rm --cached`, rewrite history before pushing.

- [ ] **Step 5: Push the branch**

```bash
git push -u origin feat/company-handbook
```

Do **not** merge to `main` without review — `main` auto-deploys.

---

## Notes for the implementer

- **The local `.env` points at production.** Every Prisma command you run hits the live database. Read-only checks are fine; think before writing.
- **If a deploy fails on a migrate advisory lock** (`P1002`), use Vercel → Redeploy, which runs a single build. Do *not* re-push repeatedly — concurrent builds make the contention worse.
- **`MagicCard` has not been used directly by a page before** — only via `StatsCard`. Task 6 is its first direct caller. If its padding fights the tile layout, override with `className`, don't fork the component.
- **Do not "fix" the coverage gaps you see while transcribing.** Indonesia having no Benefits and Noble having no Conduct policy are recorded decisions (spec §13), not bugs. The equipment gaps are deliberately left flagged for HR.
