# Pre-Evaluation Lead-Question Carry-Forward Design

**Date:** 2026-07-10
**Module:** Pre-evaluation (`PreEvaluationLeadPrep`, `PreEvaluationLeadQuestion`, `lib/pre-evaluation.ts`)

## Goal

Lead-authored pre-evaluation questions should **carry forward into each new period by default** — effective in the actual evaluations even if the lead never opens their task — while leads can still edit them before the review starts. Also backfill the already-triggered **Q2 2026** period, whose leads' Q1 questions did not carry.

## Background (verified against current code + live data)

- Each team lead gets a `PreEvaluationLeadPrep` per period, with up to `PRE_EVALUATION_QUESTION_COUNT` (2) `PreEvaluationLeadQuestion` rows and a `questionsSubmittedAt` timestamp.
- A lead's custom questions are only injected into evaluations when `hasSubmittedLeadQuestionSet(prep)` is true — i.e. `questionsSubmittedAt != null` **and** questions exist (`getLeadQuestionSetForTeamLead` → `getResolvedEvaluationQuestions`).
- Carry-forward today is **display-only**: when a lead *opens* their task, `getCurrentLeadPrep` pre-fills the previous period's submitted questions into the editor (`resolvePrepQuestionPrefill`), but they only take effect if the lead actively submits. `triggerPreEvaluationForPeriod` never copies questions — it only creates preps and PRIMARY evaluatee selections.
- The submit route (`app/api/pre-evaluation/questions/submit/route.ts`) is one-shot: it rejects if `questionsSubmittedAt` is already set. `questionsSubmittedAt` therefore doubles as both "counts in evaluations" and "locked from editing."
- Live data (2026-07-10): **Q2 2026** review starts 2026-07-13 (pre-eval window still open), triggered, 20 preps, **0 submitted / 0 with questions**. **Q1 2026**: 11 leads had submitted questions. So Q1 2026 is the carry-forward source for Q2.

## Resolved decisions

- **Effective by default:** carried questions count in evaluations automatically, without the lead acting. Leads can still edit until the review start date.
- **Backfill now + going forward:** backfill Q2 2026 from Q1 2026 (skip any lead who already customized Q2), and make carry-forward automatic for all future period triggers.
- **Approach A (carry marker):** distinguish "carried (effective, editable, no nag)" from "lead-submitted (final)" with a new `questionsCarriedForwardAt` marker, rather than auto-setting `questionsSubmittedAt` (which would block editing).
- Scope is **questions only** — evaluatee/direct-report selections are unchanged (already auto-created at trigger). Global question bank unchanged. Carried set keeps the fixed count of 2.

## Schema change (additive, safe)

Add two nullable columns to `PreEvaluationLeadPrep`:
- `questionsCarriedForwardAt DateTime?` — set when questions were auto-carried into this prep.
- `questionsCarriedFromPeriodId String?` — the source period id (plain string, for the "carried from {period}" label; resolved to a name at read time).

Nullable columns with no data backfill in the migration → safe. Vercel applies it via `prisma migrate deploy` on deploy.

## Components

### 1 — Effectiveness helper (`lib/pre-evaluation.ts`)
- New `hasEffectiveLeadQuestionSet(prep)` = `prep.questions.length > 0 && (prep.questionsSubmittedAt != null || prep.questionsCarriedForwardAt != null)`.
- `getLeadQuestionSetForTeamLead` switches from `hasSubmittedLeadQuestionSet` to `hasEffectiveLeadQuestionSet`, so carried questions are injected into evaluations. `hasSubmittedLeadQuestionSet` is retained where "lead explicitly submitted" is the intended meaning.

### 2 — Carry-forward function (`lib/pre-evaluation.ts`)
- `carryForwardLeadQuestions(db, periodId)`:
  - Loads the period's preps with their questions + `questionsSubmittedAt` + `questionsCarriedForwardAt`.
  - **Eligible = untouched**: no questions, `questionsSubmittedAt == null`, `questionsCarriedForwardAt == null`. A pure predicate `isPrepEligibleForCarryForward(prep)` encapsulates this (unit-tested).
  - For each eligible prep, finds the lead's most recent prior **submitted** question set from any earlier period (mirrors the existing `previousSubmittedPrep` query: `questionsSubmittedAt != null`, has questions, newest first).
  - Copies those questions into the prep (`PreEvaluationLeadQuestion` rows) and stamps `questionsCarriedForwardAt = now` + `questionsCarriedFromPeriodId = sourcePeriodId`.
  - Leads with no prior submitted set are skipped (global bank only, as today). Returns a summary `{ carried, skippedNoSource, skippedAlreadyTouched }`.
- Called inside `triggerPreEvaluationForPeriod` after preps are created (inside the same transaction) → **future periods auto-carry**.

### 3 — Status / reminders / overdue treat carried as handled
- `derivePreEvaluationStatus`: a prep with `questionsCarriedForwardAt` (or `questionsSubmittedAt`) set resolves to `COMPLETED` (questions are set for the period). `syncPrepStatus` then sets `completedAt`, so the prep is not marked overdue.
- `getPreEvaluationReminderCandidates`: exclude preps with `questionsCarriedForwardAt != null` (in addition to the existing `questionsSubmittedAt: null` filter) so carried leads are not reminded.
- `markOverduePreEvaluations`: unaffected because carried preps get `completedAt` via `syncPrepStatus`; no query change needed beyond the status derivation update.

### 4 — Editing (unchanged flow, extended UI)
- Carried preps keep `questionsSubmittedAt = null`, so the existing submit route already allows a lead to submit/overwrite them before the review start (`isPrepEditable`). Submitting writes the lead's questions and sets `questionsSubmittedAt` (a normal lead submission); `questionsCarriedForwardAt` may remain but submitted-state wins everywhere.
- `getCurrentLeadPrep`: because carried preps now have persisted questions, the pre-fill branch is naturally skipped and the editor shows the carried questions directly. Surface `questionsCarriedForwardAt` + source period name so the page can show a banner: **"Carried forward from {period} — edit if needed."** (extends the existing `questionPrefillFrom` banner in `app/(evaluator)/pre-evaluation/page.tsx`).

### 5 — Q2 2026 backfill script
- `scripts/backfill-preeval-carryforward.ts`: resolves the Q2 2026 period and runs `carryForwardLeadQuestions` logic.
  - **Dry-run by default**: prints each eligible lead and the source set that would be copied; makes no writes.
  - `--apply`: performs the carry inside a transaction.
  - Only fills untouched preps, so any lead who already customized Q2 is skipped.

## Data flow

Trigger (or backfill) → each untouched lead prep receives the lead's prior questions + `questionsCarriedForwardAt`/`FromPeriodId` → `hasEffectiveLeadQuestionSet` is true → carried questions appear in evaluations by default → lead may open `/pre-evaluation` before review start, see the "carried from {period}" banner, edit, and submit (normal submission) → or leave as-is.

## Testing

- Unit tests (`node --import tsx --test`):
  - `hasEffectiveLeadQuestionSet`: submitted+questions → true; carried+questions → true; neither → false; flag set but no questions → false.
  - `isPrepEligibleForCarryForward`: untouched → true; has questions → false; submitted → false; already carried → false.
  - `derivePreEvaluationStatus`: carried (not submitted) → `COMPLETED`.
- `npx tsc --noEmit` clean.
- Verification: run the backfill **dry-run** against live data and confirm the Q2 2026 leads and their Q1 source sets look correct before `--apply`.

## Non-goals

- No change to evaluatee/direct-report selections, the global question bank, or the fixed question count (2).
- No relaxation of the one-shot submit guard for self-authored (already-submitted) preps.
- No recovery of periods with no prior submitted questions (nothing to carry).
- No new admin UI beyond the carried-from banner on the lead's page (HR already sees status; a carried prep shows as complete).

## Build order (phases)

1. Prisma migration: add `questionsCarriedForwardAt` + `questionsCarriedFromPeriodId` to `PreEvaluationLeadPrep`.
2. Pure helpers + status/effectiveness updates in `lib/pre-evaluation.ts` (+ unit tests).
3. `carryForwardLeadQuestions` + wire into `triggerPreEvaluationForPeriod`; update reminders exclusion.
4. Pre-evaluation page banner for carried questions.
5. `scripts/backfill-preeval-carryforward.ts` (dry-run + `--apply`); run dry-run to verify, then apply to Q2 2026.
