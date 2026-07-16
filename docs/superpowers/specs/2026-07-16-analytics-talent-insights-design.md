# Analytics Expansion — Talent Insights

**Date:** 2026-07-16
**Status:** Approved design
**Scope:** Expand the admin analytics tab with multi-period talent analytics built on historical evaluation scores.

---

## 1. Context

The admin analytics tab (`/admin/analytics`) today renders a single evaluation period: four summary cards, a department-performance bar chart, a score-distribution histogram, and top-5 / bottom-5 performer lists. It answers "how did this quarter go?" and nothing else.

Two facts make a richer build possible now:

1. **A second period exists.** Q1 2026 is complete and locked; Q2 2026 is filling in. Crossing from one period to two unlocks trends, trajectory, and momentum for the first time.
2. **The data is richer than the current views expose.** Every rating is `0–4`, tagged by *relationship lens* (C-level, team lead, direct report, peer, cross-department, HR, department, self) and timestamped. Per-lens score breakdowns already exist inside scoring/reports but are never surfaced analytically.

**Goal:** analytics that support building a world-class team — spotting trajectory, identifying talent, exposing blind spots, and keeping the underlying ratings trustworthy.

## 2. Goals

- **Trajectory / momentum** — quarter-over-quarter direction for the org, each department, and each person.
- **Talent grid** — see performance, momentum, and rating consensus together to support promotion / development / at-risk decisions.
- **360 blind spots** — surface where a person is seen differently by different lenses, and where self-perception diverges from others'.
- **Fairness / calibration** — rating distribution, evaluator leniency vs. severity, and top-rating usage, so leadership can trust scores before acting on them.
- **Form and function** — a visually distinctive, animated surface with one earned 3D hero view.

## 3. Non-goals (out of scope)

- Any new access tier. Analytics stays **admin/leadership-only, org-wide**. No per-lead scoped views, no employee-facing analytics.
- Precomputed / materialized analytics snapshots. At current data volume (~1k evaluations per period) on-the-fly computation is fast enough; snapshots would add migration and staleness complexity for no benefit.
- Changes to how scores are calculated, how weights are assigned, or how the four-rating cap behaves. This work **reads** existing semantics; it does not alter them.
- NLP / AI theme extraction from free-text feedback.
- A "potential" signal. We have none, so the talent grid uses **momentum** as its second axis and says so plainly.

## 4. Data foundation

| Fact | Implication |
|---|---|
| `Evaluation.ratingValue` is `Float?` on a 0–4 scale, with `submittedAt` | Distribution and calibration are computable directly from raw rows |
| Ratings are tagged by relationship lens via the question bank | Per-lens (360) analysis is cheap |
| `EvaluationQuestion` has **no competency/category field** — questions are grouped only by `relationshipType` and `orderIndex` | **No cross-lens competency framework is possible.** Question-level analysis is per-question-within-a-lens only. A competency heatmap is not in scope. |
| Per-lens normalized scores + weighted overall already exist in `lib/scoring.ts` | Analytics must reuse this math, not reimplement it |
| Only two periods have data today | Trends show a single delta until Q3; all views must degrade gracefully |

## 5. Architecture

**One shared computation, four views.** Every view derives from a single primitive: the **period score matrix**.

### 5.1 Shared normalization helper

`lib/scoring.ts` currently computes per-employee scores with many queries per person. The core math (per-question average → per-lens normalized 0–4 → weighted overall) is extracted into a small **pure helper** consumed by *both* `scoring.ts` and the new matrix.

This is the one targeted refactor in scope. Rationale: it makes analytics structurally incapable of disagreeing with individual reports. A guard test asserts the extracted helper reproduces existing `scoring.ts` semantics exactly.

### 5.2 `lib/analytics/period-score-matrix.ts`

`computePeriodScoreMatrix(periodId)` — bulk-loads submitted evaluations, resolved assignments, users, weight profiles, and weightages for a period in a handful of queries, then computes **in memory** for every reportable employee:

```ts
interface EmployeePeriodScore {
  employeeId: string
  department: string | null
  overallScore: number                                  // 0–100
  perLens: Record<RelationshipType, LensScore | undefined> // normalized 0–4
  weights: Record<string, number>
}
interface LensScore { normalizedScore: number; evaluatorCount: number }
```

Eligibility matches existing report rules: `shouldReceiveConstantEvaluations` **and** has incoming assignments for the period.

### 5.3 Pure view modules (no DB access)

- `lib/analytics/trends.ts`
- `lib/analytics/talent-grid.ts`
- `lib/analytics/blind-spots.ts`
- `lib/analytics/calibration.ts`

Each takes score matrices (and, for calibration, raw rating rows) and returns view-ready data. Fully unit-testable with fixtures.

### 5.4 API

**`GET /api/admin/analytics/insights`** — admin-gated exactly like the existing route.

- Resolves the ordered period list by `startDate`, keeping only periods with submitted evaluations.
- Computes a matrix per relevant period, runs the four modules, returns **one combined payload** so the client fetches once and switches tabs with no refetch.
- Query params: `periodId` selects the "current" period (defaults to active, else latest). The **comparison period defaults to the immediately prior period** with data.

**`GET /api/admin/analytics`** is unchanged and continues to feed the Overview tab.

## 6. Metric definitions

### 6.1 Trends

- **Org series** — mean of employee `overallScore` per period.
- **Department series** — same, grouped by department.
- **Movers** — `delta = current.overallScore − comparison.overallScore`. Requires a score in **both** periods. Sorted descending → top improvers; ascending → top decliners. Limit `MOVERS_LIMIT = 5` per direction.
- **New joiners** — present in current, absent in comparison. Listed separately; never ranked as movers.
- `insufficientData: true` when fewer than two periods have data.

### 6.2 Talent grid / Talent Cube

Three axes, all already computed:

- **Y — performance** = current-period `overallScore`. Bucketed by **cohort-relative tertiles** → `LOW | MID | HIGH`. The cohort is *all reportable employees with a score in the current period* (not per-department). Relative (not absolute) so cells populate meaningfully; the real score is always shown on hover so relative placement never hides the absolute number.
- **X — momentum** = Q-o-Q delta, in points on the **0–100 overall-score scale**. `|delta| ≤ MOMENTUM_DEAD_BAND (3.0)` → `STABLE`; above → `RISING`; below `−band` → `DECLINING`.
- **Z — consensus** = `clamp(1 − spread / 4, 0, 1)` where `spread = max − min` across **external** lens scores (0–4, excluding `SELF`). Requires ≥2 external lenses; otherwise `null`, rendered at a neutral Z with a marker.

Consensus is the axis a flat 9-box cannot express: it distinguishes a high performer everyone agrees on from a high performer whose reviews are split — a materially different decision.

**Nine labeled cells** across performance × momentum:

| | Declining | Stable | Rising |
|---|---|---|---|
| **High** | Slipping star | Top performer | Accelerate |
| **Mid** | Drifting | Core | Emerging |
| **Low** | At-risk | Needs support | Improving |

**New joiners** (no prior period) have no momentum and render in a separate "New" band.

Tunable constants: `MOMENTUM_DEAD_BAND = 3.0`, tertile bucketing method, `MOVERS_LIMIT = 5`.

### 6.3 360 blind spots (current period)

- **Self-awareness gap** = `selfScore − weightedAvgOthers` on the 0–4 scale, where others are weighted by the employee's applied weights excluding `SELF`. Positive = overrates self relative to others.
- **Lens spread** = `max − min` across external lenses (excludes `SELF`).
- **Flags** — top `BLIND_SPOT_FLAG_LIMIT = 5` by `|selfGap|`; top `BLIND_SPOT_FLAG_LIMIT` by `spread`.
- **Requirements** — ≥2 external lenses for spread; a `SELF` score for the gap. Employees failing these are excluded with an `insufficientData` reason rather than shown as zero.
- Per-person radar across lenses on click.

### 6.4 Calibration (about evaluators, not evaluatees)

- **Leniency / severity** = evaluator's mean rating given in the period minus the org mean. Requires `MIN_RATINGS_FOR_CALIBRATION = 5` ratings to rank, avoiding small-sample noise. Ranked both directions.
- **Distribution** — histogram of all submitted `ratingValue`s, surfacing inflation toward 4.
- **Top-rating usage** — overall share of 4s, plus how many evaluators sit at or near the existing cap (reusing `getMaxAllowedFourRatings` semantics). **At cap** = `usedFours ≥ maxAllowed`; **near cap** = `usedFours ≥ maxAllowed − 1`. Evaluators **exempt** from the cap (partner-level titles, and the configured C-level exempt evaluator) are excluded from at/near-cap counts and flagged as exempt in the leniency list — an uncapped evaluator giving many 4s is expected, not a calibration signal.

## 7. Visual direction

### 7.1 The Talent Cube (3D hero)

The only 3D view, because it is the only view with a genuine third variable. 3D is avoided elsewhere: occlusion and perspective distortion make values harder to compare, which would trade away the "function" half of the goal for decoration.

- **Stack:** `@react-three/fiber` + `@react-three/drei` (orbit controls, 3D text, HTML labels).
- **Loading:** `dynamic(..., { ssr: false })` so it never affects initial page load.
- **Fallback:** a 2D 9-box scatter when WebGL is unavailable.
- **Interaction:** orbit, hover to expand a person (showing real scores), click to drill into their radar.
- Respects `prefers-reduced-motion`.

Plotly / ECharts-GL were rejected: both are heavy and read as generically "scientific," clashing with the existing UI.

### 7.2 Animation (everywhere else)

`framer-motion` is already in the project. Views stay 2D but heavily animated: staggered card reveals, animated line-draw on trends, morphing radar transitions, count-up stats. `recharts` already covers `LineChart`, `ScatterChart`, `RadarChart`, and `BarChart` — no new 2D charting dependency.

**Implementation note:** the `dataviz` skill must be invoked before writing any chart code (chart form, color, legend, axis decisions), and `frontend-design` for aesthetic direction.

## 8. UI structure

The page today is one ~260-line client component. It becomes a thin shell (period selector + sub-tabs + fetching), with each view extracted into a focused component under `components/analytics/`:

- `OverviewTab.tsx` — today's cards and charts, moved as-is
- `TrendsTab.tsx` — line chart + movers list
- `TalentGridTab.tsx` — the 3D Cube (with 2D fallback)
- `BlindSpotsTab.tsx` — flag lists + per-person radar
- `CalibrationTab.tsx` — distribution histogram + leniency ranking

A **period selector** is added — the page currently hardcodes the active period, and the new views need to choose "current."

## 9. Error handling and degradation

- Admin gate → `401`, matching the existing route.
- No periods → existing empty state.
- Per-employee compute failures are logged and skipped rather than failing the whole response, matching current route behavior.
- Every module returns an `insufficientData` flag. The UI renders an explicit "needs another completed quarter" message instead of a misleading empty chart — the expected state for Trends and momentum until Q3, and for any employee without a Q1 baseline.
- Client fetch failure → toast, matching the current pattern.

## 10. Testing

Unit tests via `node:test`, matching the existing `tests/` setup (no live-DB tests):

- **trends** — delta computation, mover ranking and limits, new-joiner separation, `insufficientData` with one period.
- **talent-grid** — tertile bucketing including boundary values, momentum dead-band edges (exactly ±3.0), consensus math, `null` consensus with <2 lenses, new joiners.
- **blind-spots** — self-gap math with weighted others, spread math, the "too few lenses" and "no self score" paths.
- **calibration** — leniency deviation, the `MIN_RATINGS_FOR_CALIBRATION` threshold, distribution counts, exempt-evaluator handling.
- **shared normalization helper** — guard test asserting it reproduces `scoring.ts` semantics, so the refactor cannot silently shift anyone's score.

## 11. Risks and constraints

- **Refactor risk.** Extracting the normalization helper touches live scoring. Mitigated by the guard test; no behavior change intended.
- **Thin trend data.** Two periods means one delta. Views degrade gracefully and enrich automatically as periods land.
- **Relative tertiles.** Cohort-relative placement always fills the grid, which can imply spread where little exists. Mitigated by always showing absolute scores on hover.
- **Bundle size.** Three.js is lazy-loaded and isolated to one tab.
- **Public repo.** This repository is public. No employee names, scores, or other PII may appear in this spec, in code, in tests, or in fixtures. Test fixtures use synthetic identifiers.
