# Handbook Showcase — Design

**Status:** Approved
**Date:** 2026-07-17
**Supersedes nothing.** Extends `2026-07-16-company-handbook-design.md` (the Handbook's data model and audience rules, which stand unchanged).

## 1. Goal

Make the Handbook the best-executed surface in the app. A first-time employee should feel they have
joined a serious company; an employee three years in should be able to find a policy in seconds.

## 2. What is wrong today

Verified in a browser on 2026-07-17 (the reader had never been looked at — it shipped verified by
tests and a data check only). Findings, worst first:

1. **The hierarchy is inverted.** The Welcome page is a personal letter from the founder — it opens
   with a greeting and closes with a sign-off. It renders in `text-sm text-muted-foreground`, the
   app's token for de-emphasised fine print, identical to a clause about equipment returns. The most
   human content in the Handbook is styled as the least important.
2. **The hero is empty.** A ~110px card with the title in the top-left and dead space to its right.
   `BackgroundBeams` sits at `opacity-40` over a white background and is effectively invisible in
   light mode. It reads as unfinished.
3. **Tiles are inert labels.** Icon + title in a large empty box. No description, no sense of what is
   inside. They look like disabled buttons.
4. **The grid is ragged.** Three columns against categories of 2, 4 and 1 leave holes; two pages sit
   alone on their own row.
5. **Arrival is slow.** Both pages are client components that fetch after mount: blank →
   spinner → fade, on every visit.

Dark mode, the untagged banner, the reading measure and the category grouping are all sound and are
**not** being changed.

**The conclusion that shaped this design:** the problem was never missing animation. Motion layered
onto this page would have decorated an inverted hierarchy. Hierarchy first, flourish second.

## 3. Hard constraints

- **C1 — Additive only.** No existing column, row or behaviour is altered or removed. The migration
  adds one enum and two nullable columns. No backfill. Existing pages render unchanged until HR fills
  the new fields in.
- **C2 — No policy content in git.** `Data-Quant/compass` is public. No handbook body text, no rate
  tables, no descriptions of real policies in source, tests or fixtures.
- **C3 — No employee PII in git.** No real names, titles or signatures in source. The founder's name
  lives in the database, never in a source file.
- **C4 — Audience filtering stays server-side.** Search filters **only** what the server already
  returned for that user. The hub still carries **no bodies**; search runs over titles and
  descriptions, so the hub remains structurally unable to leak another team's content.
- **C5 — No inference.** The page is identical for everyone; nothing adapts on account age or
  visit history. (Consistent with the project's earlier rejection of inference for team tags.)
- **No `whileHover` / `whileInView`.** The app has zero of both. Hover stays CSS `transition-colors`.
- **Motion must never delay reading.** This page is visited often. Any animation that gates content
  is a tax paid on every visit.
- Do not use `PageTransition`, `PageHeading`, `DataCard`, `spotlight`, `card-hover-effect`,
  `text-generate-effect` or `blur-fade` — all have zero consumers.

## 4. Schema (additive migration)

```prisma
/// How a page's body is presented. POLICY is the calm default; LETTER is the
/// correspondence treatment (serif, generous measure, sign-off under a rule).
enum HandbookLayout {
  POLICY
  LETTER
}
```

On `HandbookPage`:

| Column | Type | Purpose |
|---|---|---|
| `description` | `String?` | One line, shown under the title on the hub and searched over. Audience-independent, so it lives on the page, not the variant. |
| `layout` | `HandbookLayout?` | `null` and `POLICY` both render the policy treatment. Only `LETTER` differs. |

Both nullable, no default backfill, no data migration. A page with no `description` renders its title
alone, exactly as today.

`description` is page-level, not variant-level, deliberately: Leave Policy has four variants but one
purpose. A per-variant description would imply the *purpose* differs by team, which it does not — and
it would put audience-dependent text on the bodyless hub.

## 5. The hub

### 5.1 Hero

Replaces the empty box. Composition, top to bottom:

- Editorial label: `PLUTUS21 · <TEAM LABEL>` — uppercase, tracked, muted. Omitted when untagged.
- A gradient hairline rule (violet → transparent).
- `Welcome to Plutus21, <FirstName>.` — `font-display` (Instrument Serif), light, ~38px, with the
  first name in `gradient-text`.
- A one-line subtitle.
- The search field (§5.2).

`BackgroundBeams` stays. The current `opacity-40 dark:opacity-20` is the bug, not the beams: 40% of a
faint violet over a white card is invisible. Light mode goes to `opacity-70`, dark stays at
`opacity-20` (where it already reads). The implementer must confirm both in a browser — this is a
"look at it" decision, not a computable one.

**No call-to-action button in the hero.** The featured Welcome card (§5.3) is the single "start
here" affordance. Two of them stacked is the orientation-module feel this design rejects.

The greeting does not change with tenure. The dashboard already greets every user every day and it
reads as hospitality; a greeting that silently disappears on day 31 would read as a bug.

### 5.2 Search

An input in the hero. Filters live, client-side, over the `title` and `description` of the pages the
server already returned. `⌘K` / `Ctrl+K` focuses it.

- No new endpoint and no new query. The hub response is already the complete set of pages this user
  may see.
- Filtering is a **pure function** — `filterPages(pages, query)` — so it is exhaustively testable
  without a browser or a database, matching the Handbook's existing split.
- Empty result renders the existing `EmptyState`, not a blank region.
- Categories with no surviving match are hidden entirely, headers included.

### 5.3 Tiles

- **`START_HERE` renders as featured cards** — two columns, `MagicCard`, icon, title, description.
  This is the new hire's landing point.
- **Every other category renders as dense rows** — full-width, icon in a tinted square, title,
  description, chevron. Rows have no columns, so the ragged-grid holes cannot occur.

Only `START_HERE` is special. There are no per-category rules to maintain.

## 6. The detail page

### 6.1 The reading floor (every page)

`HandbookMarkdown` currently renders bodies at `text-sm text-muted-foreground` — small and grey.
Body copy moves to `text-base` (16px) at `text-foreground/90`, with the measure capped at `max-w-[68ch]`.
This applies to all 21 pages, not just Welcome. Long-form policy read in muted grey at 14px is poor
ergonomics regardless of which page it is.

`text-foreground/90` rather than flat `text-foreground`: full contrast is right for headings but
slightly heavy for multi-paragraph body copy. Muted-foreground stays in use for genuinely secondary
text (captions, the sign-off's role line).

The page container widens from `max-w-4xl` to accommodate the measure without the text touching the
card edge; the measure cap, not the container, governs line length.

### 6.2 The letter ceiling (`layout = LETTER`)

- Body in `font-display` (Instrument Serif), ~19px, line-height ~1.7, measure `max-w-[600px]`.
- An editorial label above the body, rendered from `description` — the same string the hub tile
  shows. This is deliberate double duty: a good description ("A letter from our founder") reads
  correctly in both places, and one field is one thing for HR to write and keep true. If
  `description` is null the label is omitted; the letter still renders.
- A rule above the closing block, so the existing markdown sign-off reads as a signature rather than
  another paragraph.

**How the sign-off is separated — HR authors it.** The rule is a markdown `---`, placed by HR on the
line before the sign-off. `HandbookMarkdown` already renders `hr`; the LETTER layout only restyles it
(wider margins, a softer line).

Nothing parses the body looking for a signature. The alternative — code that guesses which trailing
paragraphs are the sign-off — would break the first time someone edits the letter, and would do it
silently. Authoring the separator is one character of HR effort and cannot misfire. If HR omits the
`---`, the letter simply reads as continuous prose, which is a correct letter too.

**Not included:** a structured signature block with avatar, name and title. That would need two more
columns (`signatureName`, `signatureRole`); the sign-off already exists as markdown in the body and
renders acceptably under the rule. Recorded as a deliberate trade in §11.

The treatment is driven entirely by `layout`. Nothing is hardcoded to the `welcome` slug — HR can
mark any page as a letter, and un-mark this one.

## 7. Motion

The app's language is fast entry animation and `AnimatePresence`; 478 `motion.` usages, zero
`whileHover`. This design stays inside it and adds two deliberate beats.

| Element | Motion |
|---|---|
| Hero | Fade + rise on mount (`y: 16`), matching the dashboard |
| Featured cards | Stagger in, `0.06` |
| Rows | Stagger in, `0.04` — faster than cards; a long list must not crawl |
| Welcome card | `BorderBeam` traces once so the eye lands on the first read. Already a real idiom (1 existing consumer) |
| Search field | Border and ring transition on focus |
| Rows (hover) | CSS `transition-colors` only |
| Letter body | Fade + rise, single beat, no per-word reveal |

Text is never gated behind an animation. Nothing animates on scroll.

## 8. Arrival

Both pages replace the blank `LoadingScreen` with a **content-shaped skeleton**: hero block, then
category headers with row placeholders. The page has structure instantly and settles into it.

The client-fetch architecture is unchanged. Converting to server components is the better fix and is
explicitly **out of scope** — it would mean reworking `useLayoutUser`, `useSearchParams` and the
preview-as-team flow that shipped and was tested two days ago.

## 9. Admin

The page editor at `/admin/handbook/[id]` gains:

- `description` — a text input, with the hub's usage explained in help text.
- `layout` — a select (`Policy` / `Letter`).

Both save through the existing `PUT /api/admin/handbook/[id]`, which already uses the
`!== undefined` patch idiom. `layout` is validated against the enum server-side, like
`intentionalGapTeams`.

The coverage grid is untouched.

## 10. Testing

Consistent with the Handbook's existing approach — no test in this repo touches the database.

- `filterPages(pages, query)` — pure, unit-tested: title match, description match, case-insensitive,
  whitespace, empty query returns everything, no match returns empty, category collapse.
- Fixtures use invented content (`'BODY_A'`), never real policy text or names (C2, C3).
- The existing 14 audience, 8 coverage and 6 preview tests must continue to pass untouched.

## 11. Decisions log

| Decision | Choice | Why |
|---|---|---|
| Scope | Handbook becomes the showcase | Deliberately exceeds the rest of the app |
| Order | Hierarchy first, flourish second | Motion on an inverted hierarchy decorates the wrong thing |
| Welcome | Raise the floor *and* give it a ceiling | Reading quality helps all 21 pages; the letter needs more |
| Hero | Named greeting + editorial rule | Greeting from concept A, label/hairline from concept C |
| New vs returning | One hero, both doors — search, no adaptation | Search scales to all 21 pages; adaptation requires inference (C5) |
| Register | Company dashboard, not orientation module | Density and scanability over hand-holding |
| Tiles | Featured `START_HERE` + dense rows | New hire lands; returner scans; ragged grid solved |
| Letter | Serif + measure + sign-off under a rule | The content already *is* a letter; let it be one |
| Signature avatar | **Dropped** | Would need 2 more columns; sign-off already exists as markdown |
| Hero CTA | **Dropped** | Duplicated the featured Welcome card directly below it |
| Schema | 2 nullable columns + 1 enum | Additive; HR-editable, which is the point of leaving Notion |
| Arrival | Skeletons | Server components would rework a tested data path |
| Motion | Signature moments | Memorable once, invisible by visit fifty |

## 12. Out of scope

- Server-component conversion of the reader.
- Structured signature fields.
- Any change to the coverage grid, the audience model, or the admin console beyond the two new fields.
- Rolling this language out to other surfaces (dashboard, leave, evaluations).

## 13. Follow-ups for HR

- Write a `description` for each of the 21 pages. Until then, tiles show the title alone and search
  matches on title only.
- Set `layout = LETTER` on the Welcome page.
- Add a `---` to the Welcome letter's markdown on the line before "Best Regards" so the sign-off
  separates. Optional — without it the letter reads as continuous prose.
