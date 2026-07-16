# Company Handbook — Notion → Compass Migration (Design)

**Date:** 2026-07-16
**Status:** Design approved, pending spec review
**Source:** `Company Dashboard Migration_ Notion to Compass.docx` (untracked, stays untracked)

---

## 1. Summary

Migrate the company dashboard out of Notion into Compass as a new **Handbook** area at
`/handbook`. Every team member sees a hub of the policy, benefit and reference content that
applies to *their team*, filtered by a new `User.teamTag`. HR authors and maintains the content
in-app; no deploy is needed to change a policy.

This is the phase anticipated by `Onboarding Module — Implementation Plan.md`
("Company Dashboard details will come later as a separate phase").

### Non-goals (deferred)

- The public holidays list and team calendar (live data, not prose — later phase).
- Promoting core hours / leave allowances into typed data that other modules consume.
- Consolidating `BenefitCategory` with `TeamTag` (see §9).

---

## 2. Hard constraints

These are not preferences. Violating any of them is a defect.

| # | Constraint | Why |
|---|---|---|
| C1 | **Additive only.** No existing table, column, row or behaviour is altered or removed. | Explicit requirement. See §8 for the compliance table. |
| C2 | **No policy content in git.** Rate tables, profit-sharing terms and benefit text never enter a committed file. | `Data-Quant/compass` is a **public** repo. |
| C3 | **No employee PII in git.** No names, positions, salary figures or determinations — including in this spec. | Same. |
| C4 | **Audience filtering is server-side.** | Teams differ on compensation terms; client-side filtering would leak other teams' terms via devtools. |
| C5 | **Withhold rather than guess.** Never show content on a maybe. | Wrong policy shown = wrong entitlement believed. |

---

## 3. Content shape (the central fact)

The source contains **31 tagged sections**, which collapse to **21 pages / 31 variants**.

The document holds **four different "Leave Policy" documents** and **five different "Core Hours
Policy" documents** — same title, different teams, materially different terms. Two members of
different teams both have "Leave Policy" in their Handbook and read different text. Any model
treating a section as one row with a list of tags is therefore wrong.

Pages carrying more than one variant: Leave Policy (4), Core Hours Policy (5), Principles of
Conduct (2), Benefits (3). The remaining 17 pages have one variant each.

### 3.1 Teams

Seven person-level teams, exactly one per person:

`PAKISTAN` · `MOROCCO` · `COLOMBIA` · `INDONESIA` · `NOBLE` · `THREE_E_PAKISTAN` · `THREE_E_MOROCCO`

`Everyone` and `Plutus21 Internal Team` are **derived groups, never stored**:

- `Everyone` = all seven.
- `Plutus21 Internal Team` = all except the two 3E teams.

They exist only as one-click expansions in the editor, which write the underlying teams.

### 3.2 Hub categories

`Start here` · `The company` · `Policies` · `Benefits & rewards` · `Performance` · `How-to`

### 3.3 Coverage — reviewed and confirmed

Every gap below was reviewed and ruled on during design (2026-07-16). These are the **approved
baseline audiences**, not open questions. Pages visible per team: Pakistan 21, Morocco 20,
Colombia 20, Indonesia 17, Noble 17, 3E Pakistan 13, 3E Morocco 13.

| Page | Teams covered | Status |
|---|---|---|
| Travel Policy | Pakistan | ✅ Intentional — allowance is Pakistan-specific |
| Profit Sharing | Pakistan, Morocco, Colombia | ✅ Intentional — 3E/Noble are separate entities |
| Maternity Leave | Pakistan, Morocco, Colombia | ✅ Intentional — confirmed, gap stands |
| Principles of Conduct | Pakistan, Morocco, Colombia, Indonesia | ✅ Intentional — confirmed, gap stands |
| Team Reviews · Performance Evaluation · Discord Guide | Plutus21 Internal | ✅ Intentional |
| Benefits | Pakistan, Morocco, Colombia, Noble | ✅ Intentional for 3E ×2 · ⚠ **Indonesia genuinely pending** (§9.1, §13.1) |
| Company Equipment | **All seven** | 🔧 **Widened** from source — see below |
| SOP: Faulty Equipment | **All seven** | 🔧 **Widened** from source — see below |

**Approved deviation from the source.** The document tags Company Equipment Policy and the
Faulty-Equipment SOP for every team *except* Indonesia and Noble — yet both teams' own benefits
sections state they are issued a company laptop and phone. Equipment issued with no policy
governing its care, return or replacement is a contradiction in the source, not a deliberate
exclusion. Both audiences are therefore seeded to all seven teams. This is the only place the
seeded audiences knowingly differ from the document's tags; it is recorded here so the difference
is traceable rather than looking like a seeding bug.

The confirmed-intentional gaps are seeded as-is. The coverage grid (§6.1) marks them as reviewed
so they read as decisions rather than outstanding work.

---

## 4. Data model

Two enums, three tables and one nullable column. Nothing existing is modified.

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

model HandbookPage {
  id         String            @id @default(cuid())
  slug       String            @unique
  title      String
  icon       String                              // lucide icon name
  category   HandbookCategory
  orderIndex Int               @default(0)
  linkHref   String?                             // deep link into a live module
  linkLabel  String?
  isPublished Boolean          @default(false)
  intentionalGapTeams TeamTag[]                  // gaps confirmed as deliberate (§6.1)
  createdAt  DateTime          @default(now())
  updatedAt  DateTime          @updatedAt
  variants   HandbookVariant[]

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

Plus one nullable column:

```prisma
model User {
  // ... unchanged ...
  teamTag TeamTag?      // NEW — nullable, no default, no backfill
}
```

`HandbookCategory` is an enum matching §3.2.

**Why a page/variant split rather than flat rows.** A flat model duplicates title, icon, category
and order across the four Leave Policy rows — they drift, and the sidebar shows different names to
different teams. Worse, a missing variant is invisible until an employee opens an empty page, and
an overlapping one shows two conflicting policies with no way to tell which is yours. The split
makes coverage a query (§6.1) and lets overlap be rejected at save. Cost: one extra table and a
join.

**Pattern conformance.** `HandbookAudience` uses the composite-`@@id` join model already used by
`SubscriptionOwner`. `TeamTag` is a real enum, not free text — the existing `User.department` free
text field already demonstrates the failure mode, holding both `Noble` and `Noble ` as distinct
values.

---

## 5. Audience resolution

Resolution is a `where` clause on the server. Never a `.filter()` on the client (C4).

- **Hub** — published pages having ≥1 variant whose audience includes the session user's tag.
- **Detail** (`/handbook/[slug]`) — the single variant of that page matching the tag.

### 5.1 The untagged state is the launch state

No inference is performed (§6.3), so on the day this ships **every user has `teamTag = null`**.
Under strict matching they would match nothing and see an empty Handbook.

Rule: **an untagged user sees pages having a single variant addressed to all seven teams** — the
genuinely universal content. Eleven pages qualify: Welcome, Vision & Values, Our Offices, Our
Businesses, Zero Tolerance, Social Media, Inventions & Confidentiality, Termination, Approved
Vendors, and — following the §3.3 widening — Company Equipment and SOP: Faulty Equipment. Plus a
banner: *"Your team hasn't been set yet — some sections are hidden. Contact HR."*

Note the rule is deliberately *one variant covering seven teams*, not *seven teams covered across
variants*. Leave Policy and Core Hours Policy each reach all seven teams collectively, but only by
saying different things to each — so they are correctly withheld from an untagged user, who has no
team to be told the right one.

Universal content is team-independent by definition and safe for anyone. Team-specific content is
withheld, never guessed (C5). The Handbook is therefore useful on day one and gets richer as HR
assigns tags; rollout is not blocked on all 88 assignments landing.

---

## 6. Surfaces

### 6.1 Admin (`/admin/handbook`, HR only)

| Screen | Purpose |
|---|---|
| **Coverage grid** (landing) | 21 pages × 7 teams. Both the diagnostic *and* the editing surface — HR works from this view. |
| Page editor | Page metadata; variants beneath it. Each variant = markdown body + team multi-select, with `Everyone` / `Plutus21 Internal Team` expansion buttons. |
| Preview as team | Renders any team's view without changing the admin's own tag. |

Overlap is rejected at save: two variants of one page cannot both claim a team.

**The grid has three cell states, not two.** Distinguishing a decision from an omission is the
point — with only covered/uncovered, the eight permanently-intentional gaps (§3.3) would flag
forever, and real omissions would hide in the noise.

| Cell | Meaning | Click action |
|---|---|---|
| ● Covered | A variant addresses this team | Open that variant in the editor |
| – Intentional | Team is in `intentionalGapTeams` — reviewed, deliberate | Reopen the decision |
| ⚠ Unreviewed | No variant, no decision | Create a variant, or mark the gap intentional |

Seeded state has **exactly one ⚠ cell — Benefits × Indonesia** — which is precisely the one real
outstanding item (§13.1). Every other gap is either covered or recorded as intentional per §13.
That is the design working: the grid opens showing one thing that needs doing, not eight things
that don't.

### 6.2 User (`/handbook`)

Hub: hero + category sections of tiles. Detail: `/handbook/[slug]`.

Pages carrying `linkHref` render a primary CTA into the live module rather than restating the
process — Leave Policy → the leave form, Benefits → the benefits page, Company Equipment and
SOP: Faulty Equipment → device support. Policy prose and process each keep a single home.

### 6.3 User admin

One `Team` dropdown added to the existing edit-user modal in `app/(hr)/admin/users/page.tsx`,
alongside `department` and `benefitCategoryId`; one field accepted in the existing `PUT` handler.

**No inference, no bulk-assign screen.** Both were considered and rejected on evidence. A
diagnostic over the 88 live users (`scripts/diagnose-handbook-inference.ts`) found the available
signal too weak to be worth acting on: `department` is a *functional* axis (Technology, Product,
Design), not a geographic one, and carries no country information for 31 users; it identifies the
3E population but cannot split it into 3E Pakistan and 3E Morocco; `cnicNumber` is null on all 86
payroll profiles. Inference could confidently place 3 of 88 people. Guessing the rest would mean
showing someone another team's terms — C5. Per-user assignment is the ongoing need regardless, so
the dropdown is the durable answer and 88 rows is a short one-time pass.

### 6.4 Navigation

One `Handbook` item added to `EMPLOYEE_SIDEBAR`; one `Handbook` item added to the `ADMIN_SIDEBAR`
Operations group pointing at `/admin/handbook`. Route lives in the `(evaluator)` group (any
logged-in user); admin screens in `(hr)`.

---

## 7. Design language

The Handbook uses **only idioms already present in the app**. No new visual vocabulary.

| Element | Idiom | Existing precedent |
|---|---|---|
| Hub hero | `BackgroundBeams`, `opacity-40 dark:opacity-20` | `app/(auth)/login/page.tsx` |
| Headings | `font-display font-light tracking-tight` + `gradient-text` | `app/(evaluator)/dashboard/page.tsx` |
| Tiles | `MagicCard` — cursor-follow, `hover:-translate-y-1 hover:shadow-glow` | `components/composed/StatsCard.tsx` |
| Stats | `NumberTicker` | `StatsCard.tsx` |
| Primary CTA | `ShimmerButton` | 4 existing pages |
| Entrance | `stagger` — `y: 12`, `staggerChildren: 0.06` | 11 existing pages |
| Emphasis | tinted borders (`border-blue-500/20`) | dashboard |
| Page wrapper | `p-6 sm:p-8 max-w-7xl mx-auto` | repo-wide default |

Conventions to respect: **no `whileHover`/`whileTap`** (zero in the repo — hover is CSS
`transition-colors`); neutrals via CSS vars with no `dark:`, accents with explicit
`dark:text-*-400` pairs. `PageTransition`, `PageHeading` and `DataCard` exist but have zero
consumers — **do not use them**; follow the hand-rolled majority so the Handbook blends in.

Both themes are first-class. Drama on the hub; detail pages are standard `Card` +
`CardContent p-6` with nothing competing with the text.

### 7.1 Markdown rendering

`react-markdown` + `remark-gfm` (the source has tables) + `rehype-sanitize` on a tight allowlist.

This is a **deliberate, documented exception** to the repo's sanitize-at-ingest posture
(`lib/sanitize.ts`). Handbook bodies are stored as written and sanitized at render, because
markdown must survive round-tripping through the editor. The allowlist admits headings, lists,
tables, links, emphasis and code — no raw HTML, no scripts, no iframes. `dangerouslySetInnerHTML`
remains absent from the codebase.

---

## 8. Additive-only compliance (C1)

Every change, and why it is additive:

| Change | Additive? | Note |
|---|---|---|
| `TeamTag`, `HandbookCategory` enums | ✅ New types | — |
| 3 Handbook tables (incl. `intentionalGapTeams`) | ✅ New tables | — |
| `User.teamTag` | ✅ `ADD COLUMN`, nullable, no default | Postgres does not rewrite the table; no backfill; existing reads unaffected |
| `Handbook` sidebar items | ✅ New entries | Existing entries untouched |
| `Team` dropdown in user modal | ✅ New field | Existing fields untouched; omitting it leaves `teamTag` unchanged |
| New Noble benefit category row | ✅ `INSERT` | |
| Benefit rows for Employee categories | ✅ `INSERT` | Only into categories that are currently empty |
| `react-markdown`, `remark-gfm`, `rehype-sanitize` | ✅ New deps | |

**Explicitly NOT done:**

- `BenefitCategory` / `Benefit` are **not removed**. Earlier in design they were mistaken for an
  abandoned scaffold; they are Phase 5 of the onboarding plan, shipped in `bf6dd47`, with an admin
  UI, CRUD routes, a seeder and a live sidebar entry. They are empty because HR has not entered
  benefits yet — not because the feature was dropped.
- No existing row is updated. No column is dropped, renamed or retyped. No existing behaviour
  changes for a user whose `teamTag` is null — which is every user until HR acts.

---

## 9. Relationship to `BenefitCategory`

`teamTag` and `benefitCategoryId` are **independent, uncoupled** fields. They measure different
things:

- `BenefitCategory` = region × employeeType (4 regions × Employee/IC). No Noble, no 3E.
- `TeamTag` = the seven teams, including Noble and both 3E teams.

Deriving one from the other breaks for 3E and Noble (no matching category) and cannot distinguish
Employee from IC. HR sets both.

The Handbook's Benefits page therefore **links to** `/benefits` rather than restating benefit
content (§6.2), keeping one home for benefits.

**Tech debt, deliberately not addressed here:** two overlapping groupings on `User`. A future
consolidation review should decide whether `BenefitCategory` should adopt `TeamTag` or remain
orthogonal. Out of scope for this migration.

### 9.1 Filling the empty benefit categories

The source describes benefits **per team**; the categories are **region × employeeType**. Exactly
which of the 9 categories (8 existing + 1 new) get seeded:

| Category | Seeded from | Result |
|---|---|---|
| `Pakistan - Plutus21 Employee` | "Benefits for Pakistan Team" | ✅ Seeded |
| `Morocco - Plutus21 Employee` | "Benefits for Global Team" | ✅ Seeded |
| `Colombia - Plutus21 Employee` | "Benefits for Global Team" | ✅ Seeded |
| `Noble - Plutus21 Employee` | "Benefits for Noble Team" | ✅ **New category**, seeded |
| `Indonesia - Plutus21 Employee` | — | ⬜ Left empty for HR |
| `Pakistan / Morocco / Colombia / Indonesia - Plutus21 IC` (×4) | — | ⬜ Left empty for HR |

The "Benefits for Global Team" section is tagged for Morocco **and** Colombia, so its content is
seeded into both categories.

Why the blanks:

- **IC categories** — the source never distinguishes Employee from IC, and the profit-sharing
  rules it does state are full-time-only. Copying Employee benefits into IC would assert terms
  for contractors that are probably false (C5).
- **Indonesia** — the source has no Indonesia benefits section; anything written there would be
  invented (C5).

No existing `BenefitCategory` row is modified — the four seeded categories are currently empty of
benefits, so this is pure insertion (C1).

---

## 10. Getting content in (C2)

Seeding via migration `INSERT`s — the established pattern for `seed_dept_evaluation_questions` —
would place rate tables and benefit terms into a **public** repo, giving back exactly what §2 C2
protects. So:

| Artefact | Contains | Committed? |
|---|---|---|
| Migration | Enums, tables, `User.teamTag`. Structure only. | ✅ Yes — auto-applies on Vercel build |
| `scripts/seed-handbook.ts` | The 21 pages / 31 variants of policy text; benefit rows | ❌ **No — gitignored**, run once against prod |
| `Company Dashboard Migration_ Notion to Compass.docx` | Everything | ❌ No — stays untracked |

Precedent: the asset-management bulk import used the same gitignored-script approach.

The script is idempotent (upsert by slug) and needed once; thereafter HR owns content through the
editor.

**Deploy note:** migrations apply automatically on build. If the build fails on a migrate advisory
lock, use Vercel → Redeploy (a single build). Do **not** rapid re-push — concurrent builds worsen
the contention.

---

## 11. Error handling

| Situation | Behaviour |
|---|---|
| User has no tag | Universal-only view + "contact HR" banner (§5.1) |
| Page exists, no variant for the user's tag | 404 — never an empty page |
| Unpublished page | Absent from hub; 404 on direct URL, except HR preview |
| HR saves overlapping audiences | 400 naming the conflicting teams; save rejected |
| Markdown fails to render | Section falls back to plain text; error logged server-side |
| Non-HR hits an admin route | 403 via `getSession()` + `isAdminRole()`, the existing guard pattern |

---

## 12. Testing

Target ≥80% coverage across three layers.

**Unit** — audience resolution for each of the 7 tags plus untagged; `Everyone` /
`Plutus21 Internal Team` expansion; overlap detection; coverage-grid computation; markdown
sanitization (an allowlist-violating body must render inert).

**Integration** — each API route under all 8 session states (7 tags + untagged); admin routes
under HR and non-HR sessions.

**The load-bearing test — cross-team leakage.** Assert that a response to a session tagged with
team X contains **no bytes** of any variant body not addressed to X. This is the failure that
actually harms someone — reading another team's terms and believing them — and a future
refactor toward client-side filtering would silently reintroduce it. It belongs in CI, not in a
review comment.

**Manual** — light and dark on the hub and a detail page; the untagged banner; preview-as-team.

---

## 13. Baseline decisions log

All coverage questions were resolved during design on 2026-07-16. Recorded so the seeded state is
auditable and nobody re-opens a settled question.

| Question | Decision |
|---|---|
| Maternity Leave for Indonesia / Noble / 3E ×2? | **No.** Gap is correct; audience stays Pakistan, Morocco, Colombia. |
| Principles of Conduct for Noble / 3E ×2? | **No.** Gap is correct; audience stays Pakistan, Morocco, Colombia, Indonesia. |
| Company Equipment + Faulty-Equipment SOP for Indonesia / Noble? | **Yes — widen both to all seven.** Both teams receive company equipment per their benefits sections. Deviates from the source's tags by design (§3.3). |
| Indonesia benefits? | **Leave empty.** The source has none; HR fills in-app. |
| IC (contractor) benefits? | **Leave empty.** The source never separates Employee from IC; HR fills in-app. |

### 13.1 Remaining HR follow-ups

Neither blocks implementation. Both are content-entry tasks in the existing benefits admin UI,
surfaced by the coverage grid.

1. Enter the Indonesia benefits package, if one exists.
2. Enter the IC (contractor) benefits for each region.
