# Handbook Showcase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Handbook the best-executed surface in the app — a new hire feels they joined a serious company, and a three-year employee finds a policy in seconds.

**Architecture:** Hierarchy first, flourish second. Two additive nullable columns give HR a one-line `description` per page and a `layout` switch for the founder's letter. The hub gains a real hero, client-side search over already-returned data, and featured-cards-over-dense-rows. The detail page gets readable body copy and a letter treatment. Motion is added last, on top of a page that is already worth looking at.

**Tech Stack:** Next.js 15 App Router, Prisma + Neon Postgres, iron-session, Tailwind + shadcn/ui, framer-motion, react-markdown.

**Spec:** `docs/superpowers/specs/2026-07-17-handbook-showcase-design.md`
**Extends:** `docs/superpowers/specs/2026-07-16-company-handbook-design.md` (data model and audience rules — unchanged)
**Branch:** `feat/handbook-showcase` (already created, spec already committed)

## Global Constraints

Every task's requirements implicitly include this section.

- **C1 — Additive only.** No existing column, row or behaviour altered or removed. The migration adds one enum and two nullable columns. No backfill.
- **C2 — No policy content in git.** `Data-Quant/compass` is **public**. No handbook body text, no rate tables, no real descriptions in source, tests or fixtures. Test fixtures use invented content (`'BODY_A'`).
- **C3 — No employee PII in git.** No real names, titles or signatures in source. The founder's name lives in the database only. Do not paste it into a comment, test or commit message.
- **C4 — Audience filtering stays server-side.** Search filters **only** the pages the server already returned for that user. The hub still carries **no bodies**. Never add a body to the hub response.
- **C5 — No inference.** The page is identical for everyone. Nothing adapts on account age, visit count or tenure.
- **No `whileHover` / `whileInView`.** The app has zero of both. Row hover is CSS `transition-colors`.
- **Motion must never delay reading.** Text is never gated behind an animation. Nothing animates on scroll.
- **Do not use** `PageTransition`, `PageHeading`, `DataCard`, `spotlight`, `card-hover-effect`, `text-generate-effect`, `blur-fade` — all zero consumers, all previously rejected.
- **`Skeleton` (`components/ui/skeleton.tsx`) IS approved despite having zero consumers.** It is a stock shadcn primitive, not a decorative effect — a different category from the components above. Use it.
- **The migration MUST be hand-written.** See Task 1 — `prisma migrate diff` emits three unrelated `ALTER INDEX ... RENAME` statements from pre-existing drift. Sweeping them in violates C1.
- **`npm run lint` is broken repo-wide** (no ESLint config; `next lint` deprecated in Next 15.5). Do not try to fix it. Verify with `npx tsc --noEmit` and `npx next build`.
- **The local `.env` `DATABASE_URL` points at the PRODUCTION Neon database.** Every Prisma command hits production.
- Test one file: `npx tsx --test tests/<file>.test.ts`. All: `npm test` (needs `npm run dev` running for `api-integration.test.ts`).
- Verify the build with `npx next build`, **not** `npm run build` — the npm script prefixes `prisma migrate deploy`, which hits production for a no-op.

---

## File Structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` (modify) | `HandbookLayout` enum; `description` + `layout` on `HandbookPage` |
| `prisma/migrations/20260717120000_add_handbook_presentation/migration.sql` (create) | Hand-written additive migration |
| `lib/handbook/audience.ts` (modify) | Carry `description` on `PageInput`/`HubPage`; `description` + `layout` on `DetailResponse` |
| `lib/handbook/queries.ts` (modify) | Select the two new columns |
| `lib/handbook/admin-queries.ts` (modify) | Select the two new columns |
| `lib/handbook/coverage.ts` (modify) | `AdminPageInput` inherits the new fields via `PageInput` — no change needed beyond confirming |
| `lib/handbook/search.ts` (create) | `filterPages()` — pure, no Prisma |
| `tests/handbook-search.test.ts` (create) | Search unit tests |
| `components/magicui/border-beam.tsx` (modify) | Optional `loop` prop |
| `tailwind.config.ts` (modify) | `border-beam-once` animation |
| `components/handbook/HandbookHero.tsx` (create) | Hero: label, rule, greeting, subtitle, search |
| `components/handbook/HandbookRow.tsx` (create) | One dense row |
| `components/handbook/HandbookSkeletons.tsx` (create) | Hub + detail skeletons |
| `components/handbook/HandbookMarkdown.tsx` (modify) | `variant` prop: `'policy' | 'letter'` |
| `components/handbook/HandbookTile.tsx` (modify) | Featured card: description + optional BorderBeam |
| `app/(evaluator)/handbook/page.tsx` (modify) | Assemble hero + search + featured + rows |
| `app/(evaluator)/handbook/[slug]/page.tsx` (modify) | Letter vs policy; skeleton |
| `app/api/admin/handbook/[id]/route.ts` (modify) | Accept + validate `description`, `layout` |
| `app/(hr)/admin/handbook/[id]/page.tsx` (modify) | Edit `description`, `layout` |

---

## Task 1: Schema, migration, and the type flow

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260717120000_add_handbook_presentation/migration.sql`
- Modify: `lib/handbook/audience.ts`, `lib/handbook/queries.ts`, `lib/handbook/admin-queries.ts`

**Interfaces:**
- Produces: `HandbookLayout` enum (`'POLICY' | 'LETTER'`); `PageInput.description: string | null`; `PageInput.layout: HandbookLayout | null`; `HubPage.description: string | null`; `DetailResponse.description: string | null`; `DetailResponse.layout: HandbookLayout | null`.
- Consumes: existing `PageInput`, `HubPage`, `DetailResponse` from `lib/handbook/audience.ts`.

- [ ] **Step 1: Edit the schema**

In `prisma/schema.prisma`, add the enum next to `HandbookCategory`:

```prisma
/// How a page's body is presented. POLICY is the calm default; LETTER is the
/// correspondence treatment (serif, generous measure, sign-off under a rule).
enum HandbookLayout {
  POLICY
  LETTER
}
```

In `model HandbookPage`, after `isPublished Boolean @default(false)`, add:

```prisma
  /// One line, shown under the title on the hub and searched over. Page-level,
  /// not variant-level: Leave Policy has four variants but one purpose.
  description         String?
  /// null and POLICY both render the policy treatment. Only LETTER differs.
  layout              HandbookLayout?
```

**Do NOT run `npx prisma format`.** It reformats the entire 1400-line schema and buries the real diff.

- [ ] **Step 2: Verify the diff is only your two lines plus the enum**

Run: `git diff -w --stat prisma/schema.prisma`
Expected: roughly `1 file changed, 12 insertions(+)` and **0 deletions**. If you see deletions, you reformatted — `git checkout prisma/schema.prisma` and redo Step 1 by hand.

- [ ] **Step 3: Inspect what Prisma WANTS to generate — do not use it directly**

Run: `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script`

Expected output contains your `CREATE TYPE "HandbookLayout"` and two `ALTER TABLE "HandbookPage" ADD COLUMN` — **and also three unrelated `ALTER INDEX ... RENAME` statements** for `EvaluationPeriodAssignmentOverride`, `EvaluationPeriodAssignmentSnapshot` and `ProjectNotificationDigestItem`.

Those three are **pre-existing drift**, not yours. Postgres truncates identifiers at 63 chars and those indexes were created under different truncated names. Proven pre-existing in a prior session by stashing all changes and re-running this command — the three still appeared. Including them would alter objects unrelated to this work and violate C1.

- [ ] **Step 4: Hand-write the migration**

Create `prisma/migrations/20260717120000_add_handbook_presentation/migration.sql`:

```sql
-- Handbook presentation fields: additive only.
--
-- Hand-written rather than generated. `prisma migrate diff` also emits three
-- ALTER INDEX ... RENAME statements for EvaluationPeriodAssignmentOverride,
-- EvaluationPeriodAssignmentSnapshot and ProjectNotificationDigestItem. That is
-- PRE-EXISTING drift between the live database and schema.prisma (Postgres
-- truncates identifiers at 63 chars; those indexes were created under different
-- truncated names). It is unrelated to this work and is deliberately excluded --
-- this migration must not alter anything that already exists.

-- CreateEnum
CREATE TYPE "HandbookLayout" AS ENUM ('POLICY', 'LETTER');

-- AlterTable
ALTER TABLE "HandbookPage" ADD COLUMN     "description" TEXT,
ADD COLUMN     "layout" "HandbookLayout";
```

Both columns are nullable with no default, so no backfill runs and no existing row changes.

- [ ] **Step 5: Regenerate the client**

Run: `npx prisma generate`
Expected: `Generated Prisma Client`. This does not touch the database.

- [ ] **Step 6: Add the fields to the pure types**

In `lib/handbook/audience.ts`, import the enum and extend the types. Change the import line:

```ts
import type { HandbookCategory, HandbookLayout, TeamTag } from '@prisma/client'
```

In `PageInput`, after `isPublished: boolean`:

```ts
  description: string | null
  layout: HandbookLayout | null
```

In `HubPage`, after `linkLabel: string | null`:

```ts
  /// Shown under the title and searched over. Never a body -- the hub stays bodyless.
  description: string | null
```

In `DetailResponse`, after `linkLabel: string | null`:

```ts
  description: string | null
  layout: HandbookLayout | null
```

In `toHubResponse`, inside the `.map((p): HubPage => ({...}))`, add after `linkLabel: p.linkLabel,`:

```ts
        description: p.description,
```

In `toDetailResponse`, in the returned object after `linkLabel: page.linkLabel,`:

```ts
    description: page.description,
    layout: page.layout,
```

- [ ] **Step 7: Add the fields to the two query layers**

In `lib/handbook/queries.ts`, add to the `PageRow` type after `isPublished: boolean`:

```ts
  description: string | null
  layout: PageInput['layout']
```

and to `toPageInput`'s returned object after `isPublished: p.isPublished,`:

```ts
    description: p.description,
    layout: p.layout,
```

In `lib/handbook/admin-queries.ts`, in `getAllPagesForAdmin`'s `.map`, after `isPublished: p.isPublished,`:

```ts
    description: p.description,
    layout: p.layout,
```

- [ ] **Step 8: Update the existing test fixtures — they WILL break**

`description` and `layout` are **required** fields on `PageInput` (nullable, but not optional), so every object literal that builds a `PageInput` or `AdminPageInput` stops compiling. Two files, three places. This is expected — fix them, don't work around it by making the fields optional.

In `tests/handbook-audience.test.ts`, add to **both** fixture page objects (the ones at roughly lines 25 and 40, each ending `isPublished: true,`):

```ts
  description: null,
  layout: null,
```

The `draft` fixture on line 54 spreads an existing page, so it inherits them and needs no change.

In `tests/handbook-coverage.test.ts`, add the same two lines to the `base` const (roughly line 18, after `isPublished: true,`). Every fixture in that file spreads `base`, so this one edit covers all of them.

**Change no assertion.** These fixtures only need to satisfy the type; the behaviour under test is unchanged, and that is exactly what makes them a useful regression check here.

- [ ] **Step 9: Typecheck and confirm the existing tests still pass**

Run: `npx tsc --noEmit && npx tsx --test tests/handbook-audience.test.ts tests/handbook-coverage.test.ts tests/handbook-preview.test.ts 2>&1 | grep -E "^. (tests|pass|fail) "`

Expected: tsc clean; `tests 28 / pass 28 / fail 0`.

28 passing here proves the two new columns changed no existing behaviour — the point of an additive change.

- [ ] **Step 10: Apply the migration to production**

This writes to the live database. Both columns are nullable and additive; no existing row is touched.

Run: `npx prisma migrate deploy`
Expected: `1 migration found` … `Applying migration '20260717120000_add_handbook_presentation'` … `migration applied`.

If it fails with `P1002` (advisory lock timeout), wait 30s and retry once — do not run it repeatedly in a loop.

- [ ] **Step 11: Verify against the real database**

Run:
```bash
npx tsx -e "import{prisma}from'./lib/db';prisma.handbookPage.findMany({select:{slug:true,description:true,layout:true},take:3}).then(r=>{console.log(r);process.exit(0)})"
```
Expected: three rows, every `description` and `layout` `null`. That is correct — nothing is backfilled.

- [ ] **Step 12: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260717120000_add_handbook_presentation lib/handbook/audience.ts lib/handbook/queries.ts lib/handbook/admin-queries.ts tests/handbook-audience.test.ts tests/handbook-coverage.test.ts
git commit -m "feat: add Handbook description and layout fields

Two nullable columns and one enum. Additive: no backfill, no existing row
touched, every page renders exactly as before until HR fills them in.

Migration hand-written. prisma migrate diff also emits three ALTER INDEX RENAME
statements from pre-existing identifier-truncation drift on unrelated tables;
sweeping those into this migration would alter objects that already exist.

description is page-level, not variant-level: Leave Policy has four variants but
one purpose, and a per-variant description would put audience-dependent text on
the deliberately bodyless hub.

Existing fixtures gain description: null, layout: null to satisfy the type. No
assertion changed -- 28 tests still passing is the proof this altered nothing."
```

---

## Task 2: Search

**Files:**
- Create: `lib/handbook/search.ts`
- Test: `tests/handbook-search.test.ts`

**Interfaces:**
- Consumes: `HubPage` from `lib/handbook/audience.ts` (now carrying `description`).
- Produces: `filterPages(pages: HubPage[], query: string): HubPage[]`.

Search runs over what the server already returned — titles and descriptions only, never bodies (C4). It is a pure function so the behaviour is testable without a browser.

- [ ] **Step 1: Write the failing test**

Create `tests/handbook-search.test.ts`. Fixture content is invented (C2):

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { filterPages } from '../lib/handbook/search'
import type { HubPage } from '../lib/handbook/audience'

const page = (slug: string, title: string, description: string | null): HubPage => ({
  slug,
  title,
  icon: 'FileText',
  category: 'POLICIES',
  orderIndex: 0,
  linkHref: null,
  linkLabel: null,
  description,
})

const pages: HubPage[] = [
  page('leave-policy', 'Leave Policy', 'Time off and how to ask for it'),
  page('core-hours', 'Core Hours', 'When we overlap'),
  page('welcome', 'Welcome', null),
]

test('an empty query returns everything', () => {
  assert.equal(filterPages(pages, '').length, 3)
  assert.equal(filterPages(pages, '   ').length, 3)
})

test('matches on title, case-insensitively', () => {
  const r = filterPages(pages, 'leave')
  assert.deepEqual(r.map((p) => p.slug), ['leave-policy'])
  assert.deepEqual(filterPages(pages, 'LEAVE').map((p) => p.slug), ['leave-policy'])
})

test('matches on description', () => {
  const r = filterPages(pages, 'overlap')
  assert.deepEqual(r.map((p) => p.slug), ['core-hours'])
})

test('a page with a null description is still searchable by title', () => {
  assert.deepEqual(filterPages(pages, 'welcome').map((p) => p.slug), ['welcome'])
})

test('surrounding whitespace is ignored', () => {
  assert.deepEqual(filterPages(pages, '  core  ').map((p) => p.slug), ['core-hours'])
})

test('no match returns empty, never everything', () => {
  assert.deepEqual(filterPages(pages, 'zzzz'), [])
})

test('the result preserves input order', () => {
  const r = filterPages(pages, 'o') // matches all three via title or description
  assert.deepEqual(r.map((p) => p.slug), ['leave-policy', 'core-hours', 'welcome'])
})

test('does not mutate its input', () => {
  const before = pages.map((p) => p.slug)
  filterPages(pages, 'leave')
  assert.deepEqual(pages.map((p) => p.slug), before)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test tests/handbook-search.test.ts`
Expected: FAIL — `Cannot find module '../lib/handbook/search'`

- [ ] **Step 3: Write `lib/handbook/search.ts`**

```ts
import type { HubPage } from './audience'

/**
 * Filter the hub by title and description.
 *
 * Searches ONLY what the server already resolved for this user, and only
 * fields the hub carries. The hub has no bodies by design, so search cannot
 * reach another team's content even in principle.
 *
 * Pure so the behaviour is testable without a browser.
 */
export function filterPages(pages: HubPage[], query: string): HubPage[] {
  const q = query.trim().toLowerCase()
  if (!q) return pages

  return pages.filter((p) => {
    const haystack = `${p.title} ${p.description ?? ''}`.toLowerCase()
    return haystack.includes(q)
  })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test tests/handbook-search.test.ts`
Expected: PASS — 8 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add lib/handbook/search.ts tests/handbook-search.test.ts
git commit -m "feat: add pure Handbook search filter

Filters titles and descriptions of the pages the server already returned. The
hub carries no bodies, so search cannot reach another team's content even in
principle -- no new endpoint, no new query, no widening of the audience rule."
```

---

## Task 3: One-shot BorderBeam

**Files:**
- Modify: `components/magicui/border-beam.tsx`
- Modify: `tailwind.config.ts`

**Interfaces:**
- Produces: `BorderBeam` gains `loop?: boolean` (default `true`).

The spec asks for a beam that traces **once** so the eye lands on the Welcome card. The component cannot do that today: `tailwind.config.ts` defines `'border-beam': 'border-beam calc(var(--duration)*1s) infinite linear'`. Taken literally the spec would leave a permanently cycling beam on a page people open constantly — which contradicts the spec's own "invisible by visit fifty" rule.

`loop` defaults to `true`, so the existing consumer (`components/ui/modal.tsx:51`) is unchanged (C1).

- [ ] **Step 1: Add the one-shot animation**

In `tailwind.config.ts`, in `extend.animation`, directly after the existing `'border-beam'` line:

```ts
        'border-beam-once': 'border-beam calc(var(--duration)*1s) linear 1 forwards',
```

This reuses the existing `border-beam` keyframes — no new keyframes needed. `1 forwards` runs it once and holds the end state.

- [ ] **Step 2: Add the `loop` prop**

In `components/magicui/border-beam.tsx`, add to `BorderBeamProps`:

```ts
  /** false plays the beam once on mount instead of cycling forever. */
  loop?: boolean;
```

Add `loop = true,` to the destructured params (after `delay = 0,`), and change the `after:animate-border-beam` class so it is selected by `loop`. Replace this line:

```ts
        "after:absolute after:aspect-square after:w-[calc(var(--size)*1px)] after:animate-border-beam after:[animation-delay:var(--delay)] after:[background:linear-gradient(to_left,var(--color-from),var(--color-to),transparent)]",
```

with:

```ts
        "after:absolute after:aspect-square after:w-[calc(var(--size)*1px)] after:[animation-delay:var(--delay)] after:[background:linear-gradient(to_left,var(--color-from),var(--color-to),transparent)]",
        loop ? "after:animate-border-beam" : "after:animate-border-beam-once",
```

Both class names are complete literals, so Tailwind's scanner sees them.

- [ ] **Step 3: Verify it compiles and the existing consumer is untouched**

Run: `npx tsc --noEmit && git diff components/ui/modal.tsx`
Expected: tsc clean, and **no diff** for `modal.tsx` — it never passes `loop`, so it keeps cycling exactly as before.

- [ ] **Step 4: Commit**

```bash
git add components/magicui/border-beam.tsx tailwind.config.ts
git commit -m "feat: let BorderBeam play once instead of cycling

The beam animation is 'infinite'. The Handbook wants it to trace once so a new
hire's eye lands on the welcome card -- a permanently cycling border on a page
people open daily is the opposite of the intent.

loop defaults to true, so the existing modal consumer is unchanged."
```

---

## Task 4: The hub

**Files:**
- Create: `components/handbook/HandbookHero.tsx`, `components/handbook/HandbookRow.tsx`, `components/handbook/HandbookSkeletons.tsx`
- Modify: `components/handbook/HandbookTile.tsx`, `app/(evaluator)/handbook/page.tsx`

**Interfaces:**
- Consumes: `filterPages` (Task 2); `BorderBeam` `loop` prop (Task 3); `HubPage.description` (Task 1); `TEAM_LABELS` from `lib/handbook/teams.ts`; `useLayoutUser` from `components/layout/SidebarLayout`.
- Produces: `HandbookHero`, `HandbookRow`, `HandbookHubSkeleton`, `HandbookDetailSkeleton`.

- [ ] **Step 1: Write `components/handbook/HandbookHero.tsx`**

```tsx
'use client'

import { motion } from 'framer-motion'
import { Search } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { BackgroundBeams } from '@/components/aceternity/background-beams'

export function HandbookHero({
  firstName,
  teamLabel,
  query,
  onQueryChange,
}: {
  firstName: string | null
  teamLabel: string | null
  query: string
  onQueryChange: (q: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  // Cmd/Ctrl+K focuses search -- the returning employee's fast path.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-card border border-border bg-card p-8 sm:p-10 mb-8"
    >
      {/* opacity-70 in light: 40% of a faint violet over a white card is invisible. */}
      <BackgroundBeams className="opacity-70 dark:opacity-20" />

      <div className="relative">
        {teamLabel && (
          <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Plutus21 · {teamLabel}
          </p>
        )}
        <div className="h-px w-full max-w-xs bg-gradient-to-r from-primary/50 to-transparent my-3.5" />

        <h1 className="text-3xl sm:text-4xl font-display font-light tracking-tight text-foreground">
          {firstName ? (
            <>
              Welcome to Plutus21, <span className="gradient-text">{firstName}</span>.
            </>
          ) : (
            <>
              The <span className="gradient-text">Handbook</span>
            </>
          )}
        </h1>
        <p className="text-muted-foreground mt-2 max-w-xl">
          Everything about how we work — the policies, the benefits, the people.
        </p>

        <div className="relative mt-6 max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search the handbook — leave, hours, benefits…"
            aria-label="Search the handbook"
            className="w-full rounded-button border border-border bg-background/80 py-2.5 pl-10 pr-14 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
          />
          <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            ⌘K
          </kbd>
        </div>
      </div>
    </motion.div>
  )
}
```

- [ ] **Step 2: Write `components/handbook/HandbookRow.tsx`**

```tsx
'use client'

import Link from 'next/link'
import * as Icons from 'lucide-react'
import { ChevronRight } from 'lucide-react'

export function HandbookRow({
  slug,
  title,
  icon,
  description,
  previewTeam,
}: {
  slug: string
  title: string
  icon: string
  description: string | null
  previewTeam?: string | null
}) {
  const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[icon] ?? Icons.FileText
  const href = previewTeam
    ? `/handbook/${slug}?previewTeam=${encodeURIComponent(previewTeam)}`
    : `/handbook/${slug}`

  return (
    <Link
      href={href}
      className="flex items-center gap-3.5 px-4 py-3 transition-colors hover:bg-muted/50"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        {description && (
          <span className="block text-xs text-muted-foreground truncate">{description}</span>
        )}
      </span>
      <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground/50" />
    </Link>
  )
}
```

- [ ] **Step 3: Write `components/handbook/HandbookSkeletons.tsx`**

Skeleton is a stock shadcn primitive — approved despite zero existing consumers.

```tsx
import { Skeleton } from '@/components/ui/skeleton'

/** Content-shaped, so the page has structure instantly instead of a blank spinner. */
export function HandbookHubSkeleton() {
  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto">
      <div className="rounded-card border border-border bg-card p-8 sm:p-10 mb-8">
        <Skeleton className="h-2.5 w-40" />
        <Skeleton className="mt-4 h-9 w-80 max-w-full" />
        <Skeleton className="mt-3 h-4 w-96 max-w-full" />
        <Skeleton className="mt-6 h-11 w-full max-w-md rounded-button" />
      </div>

      {[0, 1].map((section) => (
        <div key={section} className="mb-10">
          <Skeleton className="h-2.5 w-24 mb-4" />
          <div className="rounded-card border border-border divide-y divide-border">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center gap-3.5 px-4 py-3">
                <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
                <div className="w-full">
                  <Skeleton className="h-3.5 w-44" />
                  <Skeleton className="mt-1.5 h-3 w-64 max-w-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function HandbookDetailSkeleton() {
  return (
    <div className="p-6 sm:p-8 max-w-4xl mx-auto">
      <Skeleton className="h-3.5 w-28 mb-5" />
      <Skeleton className="h-8 w-72 max-w-full mb-8" />
      <div className="rounded-card border border-border bg-card p-6 sm:p-8 space-y-3">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className={i % 3 === 2 ? 'h-4 w-2/3' : 'h-4 w-full'} />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Give `HandbookTile` a description and an optional beam**

Replace `components/handbook/HandbookTile.tsx` entirely:

```tsx
'use client'

import Link from 'next/link'
import * as Icons from 'lucide-react'
import { MagicCard } from '@/components/magicui/magic-card'
import { BorderBeam } from '@/components/magicui/border-beam'

type Props = {
  slug: string
  title: string
  icon: string
  linkLabel: string | null
  description: string | null
  /** Carried through so an HR preview survives navigation into a page. */
  previewTeam?: string | null
  /** Traces the border once on mount, to land the eye on the first read. */
  beam?: boolean
}

export function HandbookTile({
  slug,
  title,
  icon,
  linkLabel,
  description,
  previewTeam,
  beam = false,
}: Props) {
  // Icon names come from a controlled seed, but fall back rather than crash.
  const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[icon] ?? Icons.FileText
  const href = previewTeam
    ? `/handbook/${slug}?previewTeam=${encodeURIComponent(previewTeam)}`
    : `/handbook/${slug}`

  return (
    <Link href={href} className="block h-full">
      <MagicCard className="relative h-full flex flex-col gap-2">
        {beam && <BorderBeam size={180} duration={6} borderWidth={1.5} loop={false} />}
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-primary shrink-0" />
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
        </div>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
        {linkLabel && <p className="text-xs text-muted-foreground">{linkLabel} →</p>}
      </MagicCard>
    </Link>
  )
}
```

- [ ] **Step 5: Assemble the hub**

Replace `app/(evaluator)/handbook/page.tsx` entirely:

```tsx
'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { AlertCircle, BookOpen } from 'lucide-react'
import { EmptyState } from '@/components/composed/EmptyState'
import { HandbookTile } from '@/components/handbook/HandbookTile'
import { HandbookHero } from '@/components/handbook/HandbookHero'
import { HandbookRow } from '@/components/handbook/HandbookRow'
import { HandbookHubSkeleton } from '@/components/handbook/HandbookSkeletons'
import { useLayoutUser } from '@/components/layout/SidebarLayout'
import { ALL_TEAMS, TEAM_LABELS } from '@/lib/handbook/teams'
import { filterPages } from '@/lib/handbook/search'
import type { HubPage } from '@/lib/handbook/audience'
import { isAdminRole } from '@/lib/permissions'
import { cn } from '@/lib/utils'

const stagger = {
  container: { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } },
  item: { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } },
}

// Rows stagger faster than cards -- a long list must not crawl.
const rowStagger = {
  container: { hidden: {}, visible: { transition: { staggerChildren: 0.04 } } },
  item: { hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } },
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
  'START_HERE',
  'THE_COMPANY',
  'POLICIES',
  'BENEFITS_AND_REWARDS',
  'PERFORMANCE',
  'HOW_TO',
]

function HandbookHubInner() {
  const user = useLayoutUser()
  const searchParams = useSearchParams()
  const previewTeam = searchParams.get('previewTeam')
  const [pages, setPages] = useState<HubPage[]>([])
  const [untagged, setUntagged] = useState(false)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    const qs = previewTeam ? `?previewTeam=${encodeURIComponent(previewTeam)}` : ''
    fetch(`/api/handbook${qs}`)
      .then((r) => r.json())
      .then((d) => {
        setPages(d.pages || [])
        setUntagged(Boolean(d.untagged))
      })
      .catch(() => setPages([]))
      .finally(() => setLoading(false))
  }, [previewTeam])

  const visible = useMemo(() => filterPages(pages, query), [pages, query])

  if (loading) return <HandbookHubSkeleton />

  const previewLabel =
    previewTeam && previewTeam !== 'UNTAGGED'
      ? TEAM_LABELS[previewTeam as keyof typeof TEAM_LABELS]
      : null
  const teamLabel =
    previewLabel ?? (user?.teamTag ? TEAM_LABELS[user.teamTag as keyof typeof TEAM_LABELS] : null)
  const firstName = user?.name?.split(' ')[0] ?? null

  const featured = visible.filter((p) => p.category === 'START_HERE')
  const rest = CATEGORY_ORDER.filter((c) => c !== 'START_HERE')

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto">
      {user && isAdminRole(user.role) && (
        <div className="flex flex-wrap items-center gap-2 mb-6 rounded-lg border border-border bg-muted/40 px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground mr-1">Preview as</span>
          <Link
            href="/handbook"
            className={cn(
              'rounded-badge border px-2.5 py-0.5 text-xs transition-colors',
              !previewTeam
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted'
            )}
          >
            Me
          </Link>
          <Link
            href="/handbook?previewTeam=UNTAGGED"
            className={cn(
              'rounded-badge border px-2.5 py-0.5 text-xs transition-colors',
              previewTeam === 'UNTAGGED'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted'
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
                previewTeam === team
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-muted'
              )}
            >
              {TEAM_LABELS[team]}
            </Link>
          ))}
        </div>
      )}

      <HandbookHero
        firstName={firstName}
        teamLabel={teamLabel}
        query={query}
        onQueryChange={setQuery}
      />

      {untagged && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 mb-8"
        >
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="text-sm font-medium text-foreground">
              Your team hasn&apos;t been set yet
            </p>
            <p className="text-sm text-muted-foreground">
              Some sections are hidden until it is. Contact HR to get set up.
            </p>
          </div>
        </motion.div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-10 w-10" />}
          title={query ? 'Nothing matches that' : 'Nothing here yet'}
          description={
            query
              ? 'Try a different word, or clear the search to see everything.'
              : 'No handbook content has been published for your team.'
          }
        />
      ) : (
        <>
          {featured.length > 0 && (
            <div className="mb-10">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-4">
                {CATEGORY_LABELS.START_HERE}
              </p>
              <motion.div
                variants={stagger.container}
                initial="hidden"
                animate="visible"
                className="grid grid-cols-1 sm:grid-cols-2 gap-4"
              >
                {featured.map((p) => (
                  <motion.div key={p.slug} variants={stagger.item}>
                    <HandbookTile
                      slug={p.slug}
                      title={p.title}
                      icon={p.icon}
                      linkLabel={p.linkLabel}
                      description={p.description}
                      previewTeam={previewTeam}
                      beam={p.slug === featured[0].slug}
                    />
                  </motion.div>
                ))}
              </motion.div>
            </div>
          )}

          {rest
            .filter((c) => visible.some((p) => p.category === c))
            .map((category) => (
              <div key={category} className="mb-10">
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-4">
                  {CATEGORY_LABELS[category]}
                </p>
                <motion.div
                  variants={rowStagger.container}
                  initial="hidden"
                  animate="visible"
                  className="rounded-card border border-border divide-y divide-border overflow-hidden"
                >
                  {visible
                    .filter((p) => p.category === category)
                    .map((p) => (
                      <motion.div key={p.slug} variants={rowStagger.item}>
                        <HandbookRow
                          slug={p.slug}
                          title={p.title}
                          icon={p.icon}
                          description={p.description}
                          previewTeam={previewTeam}
                        />
                      </motion.div>
                    ))}
                </motion.div>
              </div>
            ))}
        </>
      )}
    </div>
  )
}

// useSearchParams requires a Suspense boundary in the App Router.
export default function HandbookHubPage() {
  return (
    <Suspense fallback={<HandbookHubSkeleton />}>
      <HandbookHubInner />
    </Suspense>
  )
}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Verify in a browser — this is the real gate**

Start `npm run dev`, sign in, open `http://localhost:3000/handbook`.

Check, in **both** light and dark (toggle in the top bar):
1. The hero is full — label, gradient hairline, "Welcome to Plutus21, `<FirstName>`.", subtitle, search field. **Not** an empty box.
2. `BackgroundBeams` is actually visible in light mode. If `opacity-70` is too strong or still too faint, adjust — the spec flags this as a look-at-it decision, not a computable one.
3. `Start here` renders as two cards; every other category renders as rows with no gaps on the right.
4. The first featured card's border traces **once** and stops. It must not cycle forever.
5. Typing `leave` filters live; categories with no match disappear entirely, headers included. Clearing restores everything. `⌘K`/`Ctrl+K` focuses the field.
6. Typing `zzzz` shows the empty state, not a blank page.
7. Descriptions are absent — every page's `description` is null until HR writes them. Rows showing title only is **correct** at this stage, not a bug.

- [ ] **Step 8: Commit**

```bash
git add components/handbook/HandbookHero.tsx components/handbook/HandbookRow.tsx components/handbook/HandbookSkeletons.tsx components/handbook/HandbookTile.tsx "app/(evaluator)/handbook/page.tsx"
git commit -m "feat: rebuild the Handbook hub

The hero was a ~110px empty box with beams invisible at 40% over white; tiles
were icon-and-title labels in empty boxes; a 3-col grid left holes wherever a
category had 2 or 4 items.

Now: editorial label, gradient rule, named greeting, and search over titles and
descriptions. Start here renders as featured cards -- the new hire's landing
point -- and every other category as dense rows, which have no columns and so
cannot leave holes.

Search filters only what the server already returned. The hub still carries no
bodies, so it remains unable to leak another team's content."
```

---

## Task 5: The detail page

**Files:**
- Modify: `components/handbook/HandbookMarkdown.tsx`, `app/(evaluator)/handbook/[slug]/page.tsx`

**Interfaces:**
- Consumes: `DetailResponse.layout` / `.description` (Task 1); `HandbookDetailSkeleton` (Task 4).
- Produces: `HandbookMarkdown` gains `variant?: 'policy' | 'letter'` (default `'policy'`).

The sanitize schema is security-critical and must exist in exactly one place. Add a variant to the existing renderer — do **not** create a second markdown component.

- [ ] **Step 1: Add the `variant` prop to `HandbookMarkdown`**

In `components/handbook/HandbookMarkdown.tsx`, replace the component signature and its wrapper `div`. Leave the `schema` const and every `components={{...}}` override **exactly as they are** — only the outer classes change.

Replace:

```tsx
export function HandbookMarkdown({ source }: { source: string }) {
  return (
    <div className="text-sm leading-relaxed text-muted-foreground space-y-4">
```

with:

```tsx
export function HandbookMarkdown({
  source,
  variant = 'policy',
}: {
  source: string
  variant?: 'policy' | 'letter'
}) {
  // Body copy was text-sm text-muted-foreground -- the app's fine-print token.
  // Long-form policy read in muted grey at 14px is poor ergonomics on any page.
  // foreground/90 rather than flat foreground: full contrast is right for
  // headings but slightly heavy for multi-paragraph body copy.
  return (
    <div
      className={
        variant === 'letter'
          ? 'font-display text-[19px] leading-[1.7] text-foreground/90 max-w-[600px] space-y-5 [&_hr]:my-8 [&_hr]:border-border/60'
          : 'text-base leading-relaxed text-foreground/90 max-w-[68ch] space-y-4'
      }
    >
```

- [ ] **Step 2: Render the letter and the skeleton**

In `app/(evaluator)/handbook/[slug]/page.tsx`:

Add `HandbookDetailSkeleton` to the imports:

```tsx
import { HandbookDetailSkeleton } from '@/components/handbook/HandbookSkeletons'
```

Add the two new fields to the `Detail` type, after `linkLabel: string | null`:

```tsx
  description: string | null
  layout: 'POLICY' | 'LETTER' | null
```

Replace `if (loading) return <LoadingScreen />` with:

```tsx
  if (loading) return <HandbookDetailSkeleton />
```

Replace the `Suspense` fallback at the bottom:

```tsx
    <Suspense fallback={<HandbookDetailSkeleton />}>
```

Then replace the `<Card>` block with one that switches on layout:

```tsx
        <Card>
          <CardContent className="p-6 sm:p-8">
            {isLetter && detail.description && (
              <>
                <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  {detail.description}
                </p>
                <div className="h-px w-full max-w-xs bg-gradient-to-r from-primary/50 to-transparent my-4" />
              </>
            )}

            <HandbookMarkdown
              source={detail.bodyMarkdown}
              variant={isLetter ? 'letter' : 'policy'}
            />

            {detail.linkHref && detail.linkLabel && (
              <div className="mt-8 pt-6 border-t border-border">
                <ShimmerButton onClick={() => router.push(detail.linkHref as string)}>
                  {detail.linkLabel}
                </ShimmerButton>
              </div>
            )}
          </CardContent>
        </Card>
```

and define `isLetter` just above the `return`, next to the existing `Icon` const:

```tsx
  const isLetter = detail.layout === 'LETTER'
```

`LoadingScreen` may now be unused in this file — if `tsc` or the build flags it, remove the import.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify the reading floor in a browser**

With `npm run dev` running, open any policy page, e.g. `http://localhost:3000/handbook/zero-tolerance-policy`.

Expected: body copy is noticeably darker and larger than before (16px at ~90% foreground, not 14px grey), line length is capped and comfortable, and it reads well in **both** themes. Tables must still scroll inside their own container without the page scrolling sideways.

- [ ] **Step 5: Verify the letter treatment against real data**

The Welcome page has no `layout` yet, so it renders as policy. Set it temporarily:

```bash
npx tsx -e "import{prisma}from'./lib/db';prisma.handbookPage.update({where:{slug:'welcome'},data:{layout:'LETTER',description:'A letter from our founder'}}).then(()=>{console.log('set');process.exit(0)})"
```

Open `http://localhost:3000/handbook/welcome`.

Expected: the editorial label and hairline above the body; the letter in Instrument Serif at 19px with generous leading and a ~600px measure. It should read as correspondence, not as a policy page.

This writes to the **production** database. It is the real intended end state (spec §13), so leaving it set is correct — but it means the Welcome page changes for everyone the moment this deploys. If you want to revert while iterating:

```bash
npx tsx -e "import{prisma}from'./lib/db';prisma.handbookPage.update({where:{slug:'welcome'},data:{layout:null,description:null}}).then(()=>{console.log('reverted');process.exit(0)})"
```

- [ ] **Step 6: Commit**

```bash
git add components/handbook/HandbookMarkdown.tsx "app/(evaluator)/handbook/[slug]/page.tsx"
git commit -m "feat: raise Handbook reading quality and add the letter treatment

The floor: body copy moves off text-sm text-muted-foreground -- the app's
fine-print token -- to 16px at 90% foreground with a 68ch measure, on all 21
pages. Long-form policy in muted grey at 14px is poor ergonomics anywhere.

The ceiling: layout=LETTER renders serif at 19px with a 600px measure, so the
founder's welcome reads as correspondence rather than as fine print identical to
a clause about equipment returns.

One markdown renderer with a variant, not two: the sanitize allowlist is
security-critical and must exist in exactly one place.

Blank spinners replaced with content-shaped skeletons."
```

---

## Task 6: Admin fields

**Files:**
- Modify: `app/api/admin/handbook/[id]/route.ts`, `app/(hr)/admin/handbook/[id]/page.tsx`

**Interfaces:**
- Consumes: `HandbookLayout` (Task 1).
- Produces: `PUT /api/admin/handbook/[id]` accepts `description` and `layout`.

- [ ] **Step 1: Accept the fields in the API**

In `app/api/admin/handbook/[id]/route.ts`, add above `export async function PUT`:

```ts
const VALID_LAYOUTS = ['POLICY', 'LETTER'] as const
```

Add `description` and `layout` to the destructure and its type:

```ts
    const {
      title,
      icon,
      category,
      orderIndex,
      linkHref,
      linkLabel,
      isPublished,
      intentionalGapTeams,
      description,
      layout,
    } = (await request.json()) as {
      title?: string
      icon?: string
      category?: string
      orderIndex?: number
      linkHref?: string | null
      linkLabel?: string | null
      isPublished?: boolean
      intentionalGapTeams?: string[]
      description?: string | null
      layout?: string | null
    }
```

Add validation after the existing `intentionalGapTeams` check:

```ts
    if (layout && !VALID_LAYOUTS.includes(layout as (typeof VALID_LAYOUTS)[number])) {
      return NextResponse.json({ error: 'Invalid layout' }, { status: 400 })
    }
```

Add to the `data` object, following the file's existing `!== undefined` patch idiom:

```ts
        ...(description !== undefined ? { description: description || null } : {}),
        ...(layout !== undefined
          ? { layout: (layout as (typeof VALID_LAYOUTS)[number]) || null }
          : {}),
```

- [ ] **Step 2: Add the fields to the editor**

In `app/(hr)/admin/handbook/[id]/page.tsx`:

Add to the `AdminPage` type after `isPublished: boolean`:

```ts
  description: string | null
  layout: 'POLICY' | 'LETTER' | null
```

Add `Select` to the imports:

```tsx
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
```

Insert this block inside `<CardContent>`, directly after the closing `</div>` of the title/icon/link grid and before the `Published` switch:

```tsx
          <div>
            <Label htmlFor="description" className="mb-1">
              Description
            </Label>
            <Input
              id="description"
              defaultValue={page.description || ''}
              placeholder="One line — shown under the title and searched over"
              onBlur={(e) =>
                e.target.value !== (page.description || '') &&
                savePage({ description: e.target.value || null })
              }
            />
            <p className="text-xs text-muted-foreground mt-1">
              Employees see this under the page title, and search matches against it. On a letter
              it also appears as the label above the body.
            </p>
          </div>

          <div>
            <Label htmlFor="layout" className="mb-1">
              Layout
            </Label>
            <Select
              value={page.layout ?? 'POLICY'}
              onValueChange={(v) => savePage({ layout: v as 'POLICY' | 'LETTER' })}
            >
              <SelectTrigger id="layout">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="POLICY">Policy — the calm default</SelectItem>
                <SelectItem value="LETTER">Letter — serif, for correspondence</SelectItem>
              </SelectContent>
            </Select>
          </div>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Verify the round-trip**

With `npm run dev` running, sign in as HR and open `/admin/handbook`. Click any page.

1. Set Description to `Test description` and blur. Expect a "Page saved" toast.
2. Reload — the value persisted.
3. Set Layout to `Letter`, reload — it persisted.
4. Open that page in the reader (`/handbook/<slug>`) — it now renders as a letter with the description as its label.
5. Set Layout back to `Policy` and clear the description, unless the page is `welcome` (which should stay `LETTER`, per spec §13).

- [ ] **Step 5: Commit**

```bash
git add "app/api/admin/handbook/[id]/route.ts" "app/(hr)/admin/handbook/[id]/page.tsx"
git commit -m "feat: let HR edit Handbook description and layout

Both fields save through the existing PUT patch idiom; layout is validated
against the enum server-side. HR owning these rather than a developer is the
whole point of leaving Notion."
```

---

## Task 7: Full verification

**Files:** none — verification only.

- [ ] **Step 1: Whole test suite**

Start `npm run dev` in another terminal first, then:

Run: `npm test 2>&1 | grep -E "^. (tests|pass|fail) "`
Expected: `393 / 393 / 0`. The baseline before this plan was 385; Task 2 adds 8.

- [ ] **Step 2: Typecheck and build**

Run: `npx tsc --noEmit && npx next build 2>&1 | grep -iE "handbook|error|warn|Compiled"`
Expected: `Compiled successfully`, the handbook routes listed, no errors or warnings.

Use `npx next build`, not `npm run build` — the npm script prefixes `prisma migrate deploy`, which would hit production.

- [ ] **Step 3: Confirm the migration is the only schema change (C1)**

```bash
git diff main..HEAD --name-only -- prisma/
```
Expected: exactly two paths — `prisma/schema.prisma` and `prisma/migrations/20260717120000_add_handbook_presentation/migration.sql`.

```bash
grep -icE "DROP|RENAME|ALTER COLUMN" prisma/migrations/20260717120000_add_handbook_presentation/migration.sql
```
Expected: `0`. Any hit means something destructive or drift-related got in — stop and report.

- [ ] **Step 4: Confirm nothing sensitive was committed (C2, C3)**

```bash
git diff main..HEAD | grep -icE "PKR [0-9]|reimbursement rate|profit pool" || echo "0 — clean"
git ls-files --error-unmatch scripts/seed-handbook.ts 2>/dev/null && echo "TRACKED — LEAK" || echo "seed still untracked — correct"
```
Expected: `0` and `untracked`. Test fixtures use invented content only.

- [ ] **Step 5: End-to-end pass, both themes**

`/handbook`: hero full, beams visible in light, `Start here` as cards with the first tracing once and stopping, other categories as rows with no right-hand gaps, search filtering live, `⌘K` focusing, empty state on no match.
`/handbook/welcome`: letter treatment — serif, label, hairline, comfortable measure.
`/handbook/<any policy>`: body copy readable at 16px, tables scrolling inside their own container.
`/admin/handbook`: grid still reads 21 / 117 / 25 / 5. Unchanged by this work.

- [ ] **Step 6: Confirm the coverage grid is untouched**

Run: `npx tsx scripts/verify-handbook-coverage.ts 2>&1 | head -8`
Expected: 21 / 117 / 25 / 5 / 147, exactly as before. This plan does not touch the audience model; if these moved, something is wrong.

- [ ] **Step 7: Push the branch**

```bash
git push -u origin feat/handbook-showcase
```

Do **not** merge to `main` without review — `main` auto-deploys, and this deploy carries a migration.

---

## Notes for the implementer

- **The local `.env` points at production.** Every Prisma command hits the live database. Task 5 Step 5 writes real content to the Welcome page.
- **Never run `npx prisma format`.** It reformats the whole schema and buries the real diff. A prior session lost time to exactly this.
- **The three `ALTER INDEX ... RENAME` statements are not yours.** Any generated migration will include them. Hand-write instead. See Task 1 Step 3.
- **Descriptions are null until HR writes them.** Rows and tiles showing a title alone is the correct launch state, not a bug. The feature lands at partial strength by design (spec §13).
- **If the deploy fails on `P1002`** (advisory-lock timeout), use Vercel → Redeploy, which runs a single build. Do not re-push repeatedly.
- **The beam must stop.** If it cycles forever, `loop={false}` did not reach `BorderBeam` or the Tailwind class was purged — check that both animation class names appear as complete literals in the source.
