# Payments Before Send + Skip-Unpaid Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the Payments wizard step before Send, have Send skip employees with 0 paid (held salaries), and let Send re-run so a held-then-paid employee's receipt goes out later.

**Architecture:** No schema change. A pure `isSendableReceipt` helper decides who gets a receipt; the send route applies it and its status guard is relaxed to allow re-runs. The wizard swaps the Payments and Send steps and widens Payments' editable window to APPROVED-onward.

**Tech Stack:** Next.js 15 App Router, Prisma + Neon Postgres, iron-session, zod, `node --test` + `tsx`.

**Spec:** `docs/superpowers/specs/2026-07-22-payroll-payments-before-send-design.md`
**Branch:** `feat/payments-before-send` (already created; spec committed)

## Global Constraints

- **No schema change, no migration.** Ordering + send logic only.
- **Public repo** `Data-Quant/compass` — no real names, salary figures, or policy content in source/tests/fixtures.
- **Local `.env` points at production Neon.** Every Prisma command hits prod.
- **`npm run lint` is broken repo-wide** — verify with `npx tsc --noEmit` and `npx next build` (not `npm run build`, which prefixes `prisma migrate deploy`).
- **No test touches the DB.** The send-eligibility rule is a pure helper, unit-tested.
- Test one file: `npx tsx --test tests/<file>.test.ts`. All: `npm test` (needs `npm run dev` for `api-integration.test.ts`).
- Do **not** actually dispatch HelloSign receipts during verification — verify the sendable *set* by script, not by sending.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/payroll/payments.ts` (modify) | Add pure `isSendableReceipt(status, paidTotal)` |
| `tests/payroll-payments.test.ts` (modify) | Tests for the new helper |
| `app/api/payroll/periods/[id]/payments/route.ts` (modify) | Editable window → APPROVED onward |
| `app/api/payroll/periods/[id]/send-docusign/route.ts` (modify) | Relax status guard; skip 0-paid; clearer error |
| `components/payroll/PayrollRunWizard.tsx` (modify) | Swap Payments/Send steps; widen editable gate; nav warnings; pre-send summary |

---

## Task 1: Pure send-eligibility helper

**Files:** modify `lib/payroll/payments.ts`; test `tests/payroll-payments.test.ts`

**Interfaces:**
- Produces: `isSendableReceipt(receiptStatus: string, paidTotal: number): boolean` — true when the receipt is not already sent (`READY`/`FAILED`) **and** the employee has a positive paid total.

- [ ] **Step 1: Add the failing tests**

Append to `tests/payroll-payments.test.ts`:

```ts
import { isSendableReceipt } from '../lib/payroll/payments'

test('isSendableReceipt: a READY receipt with paid > 0 is sendable', () => {
  assert.equal(isSendableReceipt('READY', 55_000), true)
})

test('isSendableReceipt: a READY receipt with 0 paid (held) is not sendable', () => {
  assert.equal(isSendableReceipt('READY', 0), false)
})

test('isSendableReceipt: an already-sent receipt is not re-sent even if paid', () => {
  assert.equal(isSendableReceipt('SENT', 55_000), false)
})

test('isSendableReceipt: a FAILED receipt with paid > 0 is sendable (retry)', () => {
  assert.equal(isSendableReceipt('FAILED', 55_000), true)
})

test('isSendableReceipt: negative or NaN paid is not sendable', () => {
  assert.equal(isSendableReceipt('READY', -1), false)
  assert.equal(isSendableReceipt('READY', Number.NaN), false)
})
```

`isSendableReceipt` is imported at the top of the file — merge it into the existing import from `'../lib/payroll/payments'` rather than adding a duplicate import line.

- [ ] **Step 2: Run to verify failure**

Run: `npx tsx --test tests/payroll-payments.test.ts`
Expected: FAIL — `isSendableReceipt is not a function` / not exported.

- [ ] **Step 3: Implement the helper**

Append to `lib/payroll/payments.ts`:

```ts
/**
 * Whether a receipt should be dispatched at Send. Only receipts that are not
 * already sent (READY or FAILED) go out, and only for an employee who has been
 * paid something this period -- a held (0-paid) salary gets no receipt until it
 * is paid, at which point a re-run of Send picks it up.
 */
export function isSendableReceipt(receiptStatus: string, paidTotal: number): boolean {
  const notYetSent = receiptStatus === 'READY' || receiptStatus === 'FAILED'
  return notYetSent && Number.isFinite(paidTotal) && paidTotal > 0
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx tsx --test tests/payroll-payments.test.ts`
Expected: PASS — the 9 existing + 5 new = 14 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/payroll/payments.ts tests/payroll-payments.test.ts
git commit -m "feat: add pure isSendableReceipt helper

A receipt is sendable only if not already sent (READY/FAILED) and the employee
has a positive paid total. Held (0-paid) salaries get no receipt until paid."
```

---

## Task 2: Payments editable from APPROVED

**Files:** modify `app/api/payroll/periods/[id]/payments/route.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `PUT` accepts edits when status ∈ {APPROVED, SENDING, SENT, PARTIAL}.

- [ ] **Step 1: Widen the editable window**

In `app/api/payroll/periods/[id]/payments/route.ts`, replace:

```ts
const SENT_STATUSES = new Set(['SENDING', 'SENT', 'PARTIAL', 'LOCKED'])
```

with:

```ts
// Payments are finalized after Approve and before/after Send, but not once the
// period is locked.
const EDITABLE_STATUSES = new Set(['APPROVED', 'SENDING', 'SENT', 'PARTIAL'])
```

Update the guard (the `if (!SENT_STATUSES.has(period.status))` block) to use `EDITABLE_STATUSES` and change the error message to:

```ts
    if (!EDITABLE_STATUSES.has(period.status)) {
      return NextResponse.json(
        { error: 'Approve the payroll before recording payments' },
        { status: 400 }
      )
    }
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/api/payroll/periods/[id]/payments/route.ts"
git commit -m "feat: allow recording payments from APPROVED (before Send)

Payments are now finalized before receipts are sent, so the PUT guard accepts
APPROVED/SENDING/SENT/PARTIAL and no longer requires the period to be sent."
```

---

## Task 3: Send skips 0-paid; re-runnable

**Files:** modify `app/api/payroll/periods/[id]/send-docusign/route.ts`

**Interfaces:**
- Consumes: `isSendableReceipt` (Task 1).
- Produces: Send runs from {APPROVED, SENT, PARTIAL}; dispatches only sendable receipts.

- [ ] **Step 1: Import the helper and load payments**

At the top of `app/api/payroll/periods/[id]/send-docusign/route.ts`, add:

```ts
import { isSendableReceipt } from '@/lib/payroll/payments'
```

In the `prisma.payrollPeriod.findUnique({ include: { receipts: {...} } })` call, add `payments` to the include so paid totals are available:

```ts
      include: {
        receipts: {
          include: {
            user: {
              select: { id: true, name: true, email: true, role: true },
            },
          },
        },
        payments: { select: { payrollName: true, paidAmount: true } },
      },
```

- [ ] **Step 2: Relax the status guard**

Replace:

```ts
    if (period.status !== 'APPROVED') {
      return NextResponse.json(
        { error: `Sending receipts is only allowed from APPROVED status. Current status: ${period.status}` },
        { status: 400 }
      )
    }
```

with:

```ts
    // Send runs from APPROVED (first send) and re-runs from SENT/PARTIAL to
    // dispatch held-then-paid receipts. SENDING is transient and excluded so a
    // re-run cannot collide with a send already in flight.
    if (!['APPROVED', 'SENT', 'PARTIAL'].includes(period.status)) {
      return NextResponse.json(
        { error: `Sending is only allowed from an approved or sent period. Current status: ${period.status}` },
        { status: 400 }
      )
    }
```

- [ ] **Step 3: Apply the paid-total filter**

After the existing status-branch filter (the `if (requestedIds.size > 0) {...} else if (resendFailedOnly) {...} else {...}` block that produces `receipts`), and **before** the `if (receipts.length === 0)` check, insert:

```ts
    // Skip employees held at 0 paid -- they get no receipt until paid. Applies
    // to every trigger (default, resend, targeted) so a held salary is never
    // dispatched by any path.
    const paidByName = new Map<string, number>()
    for (const p of period.payments) {
      paidByName.set(p.payrollName, (paidByName.get(p.payrollName) ?? 0) + p.paidAmount)
    }
    const eligibleByStatus = receipts.length
    receipts = receipts.filter((receipt) =>
      isSendableReceipt(receipt.status, paidByName.get(receipt.payrollName) ?? 0)
    )
    const heldSkipped = eligibleByStatus - receipts.length
```

- [ ] **Step 4: Sharpen the empty-set error**

Replace the existing:

```ts
    if (receipts.length === 0) {
      return NextResponse.json(
        { error: 'No receipts are eligible for sending for the requested criteria.' },
        { status: 400 }
      )
```

with a message that distinguishes "all held / none finalized" from "nothing left to send":

```ts
    if (receipts.length === 0) {
      return NextResponse.json(
        {
          error:
            heldSkipped > 0
              ? 'No paid employees to send. Record payments first, or every remaining employee is held at 0.'
              : 'No receipts are eligible for sending for the requested criteria.',
        },
        { status: 400 }
      )
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "app/api/payroll/periods/[id]/send-docusign/route.ts"
git commit -m "feat: Send skips 0-paid employees and can re-run

Send now dispatches a receipt only to employees paid something this period; held
(0-paid) salaries keep their READY receipt. The status guard is relaxed to
APPROVED/SENT/PARTIAL so paying a held employee later and re-running Send
delivers just their receipt."
```

---

## Task 4: Reorder the wizard steps

**Files:** modify `components/payroll/PayrollRunWizard.tsx`

**Interfaces:**
- Consumes: Task 2/3 behaviour.
- Produces: step order Approve(3) → Payments(4) → Send(5); Payments editable from APPROVED; a pre-send summary.

- [ ] **Step 1: Swap the STEPS entries**

In `components/payroll/PayrollRunWizard.tsx`, the `STEPS` array currently ends:

```ts
  { label: 'Send', description: 'Dispatch receipts via HelloSign' },
  { label: 'Payments', description: 'Record what was actually paid' },
] as const
```

Swap them so Payments is step 4 and Send is step 5:

```ts
  { label: 'Payments', description: 'Record what was actually paid' },
  { label: 'Send', description: 'Dispatch receipts once payments are finalized' },
] as const
```

- [ ] **Step 2: Swap the render conditions**

The two step blocks are gated by `currentStep === 4` (Send) and `currentStep === 5` (Payments). Swap the numbers so they match the new STEPS order:

- Change the Send block's guard from `{currentStep === 4 && (` to `{currentStep === 5 && (`.
- Change the Payments block's guard from `{currentStep === 5 && (` to `{currentStep === 4 && (`.

(Leave the block bodies where they are in the file; only the guard numbers change.)

- [ ] **Step 3: Widen the Payments editable gate**

In the Payments block, change:

```tsx
                editable={['SENDING', 'SENT', 'PARTIAL', 'LOCKED'].includes(period.status)}
```

to:

```tsx
                editable={['APPROVED', 'SENDING', 'SENT', 'PARTIAL'].includes(period.status)}
```

- [ ] **Step 4: Fix the navigation warnings**

In `handleStepClick`, the two warnings are currently keyed to the old positions (step 4 = Send, step 5 = Payments). Replace both with the new positions — step 4 is Payments, step 5 is Send, both requiring an approved-or-later period:

```ts
    if (
      step === 4 &&
      !['APPROVED', 'SENDING', 'SENT', 'PARTIAL'].includes(period.status)
    ) {
      toast.warning('Approve the period before recording payments')
    }
    if (
      step === 5 &&
      !['APPROVED', 'SENDING', 'SENT', 'PARTIAL'].includes(period.status)
    ) {
      toast.warning('Approve the period before sending receipts')
    }
```

- [ ] **Step 5: Add a pre-send summary to the Send step**

The Send block renders a receipts table. Directly above that table (inside the Send block), add a summary computed from `period.payments` and `period.receipts` so HR sees who will be sent vs held before dispatching. Add this near the top of the Send block's JSX (after the heading):

```tsx
              {(() => {
                const paidByName = new Map<string, number>()
                for (const p of period.payments || []) {
                  paidByName.set(p.payrollName, (paidByName.get(p.payrollName) || 0) + p.paidAmount)
                }
                const receipts = period.receipts || []
                const held = receipts.filter(
                  (r: any) =>
                    (r.status === 'READY' || r.status === 'FAILED') &&
                    (paidByName.get(r.payrollName) || 0) <= 0
                ).length
                const willSend = receipts.filter(
                  (r: any) =>
                    (r.status === 'READY' || r.status === 'FAILED') &&
                    (paidByName.get(r.payrollName) || 0) > 0
                ).length
                return (
                  <div className="rounded-lg border border-border bg-muted/40 px-4 py-2 text-sm">
                    <span className="font-medium text-foreground">{willSend}</span>{' '}
                    <span className="text-muted-foreground">will be sent</span>
                    {held > 0 && (
                      <>
                        {' · '}
                        <span className="font-medium text-amber-600 dark:text-amber-400">{held}</span>{' '}
                        <span className="text-muted-foreground">held (0 paid — no receipt)</span>
                      </>
                    )}
                  </div>
                )
              })()}
```

This reads `period.payments`, which the period GET route already includes (added when the Payments step shipped).

- [ ] **Step 6: Typecheck and build**

Run: `npx tsc --noEmit && npx next build 2>&1 | grep -iE "Compiled successfully|error|Failed" | head -5`
Expected: `Compiled successfully`, no errors.

- [ ] **Step 7: Commit**

```bash
git add components/payroll/PayrollRunWizard.tsx
git commit -m "feat: move Payments before Send in the wizard

Order is now Approve -> Payments -> Send. Payments is editable from APPROVED;
the Send step shows a 'N will be sent, M held' summary so a forgotten finalize
is visible before dispatching."
```

---

## Task 5: Verification

**Files:** none — verification only.

- [ ] **Step 1: Full test suite**

Start `npm run dev` in another terminal, then:
Run: `npm test 2>&1 | grep -E "^. (tests|pass|fail) "`
Expected: all pass (5 new send-eligibility tests added).

- [ ] **Step 2: Typecheck and build**

Run: `npx tsc --noEmit && npx next build 2>&1 | grep -iE "Compiled successfully|error|Failed"`
Expected: clean.

- [ ] **Step 3: Confirm no schema change**

```bash
git diff main..HEAD --name-only -- prisma/
```
Expected: **no output** — this change touches no schema or migration.

- [ ] **Step 4: Confirm nothing sensitive committed**

```bash
git diff main..HEAD -- ':(exclude)docs/' | grep -icE "PKR [0-9]|plutus21\.com|real employee names" || echo "0 — clean"
```
Expected: `0`.

- [ ] **Step 5: Verify the sendable set against real data — WITHOUT sending**

Write a throwaway `.tmp-verify-send.ts` (delete after) that, for the June period, computes who is sendable, holds one employee at 0 via `savePaymentMarks`, recomputes, confirms that employee drops out of the sendable set, then restores:

```ts
import { prisma } from './lib/db'
import { getPaymentGrid, savePaymentMarks } from './lib/payroll/payment-queries'
import { isSendableReceipt } from './lib/payroll/payments'

async function sendable(periodId: string) {
  const [receipts, payments] = await Promise.all([
    prisma.payrollReceipt.findMany({ where: { periodId }, select: { payrollName: true, status: true } }),
    prisma.payrollPayment.findMany({ where: { periodId }, select: { payrollName: true, paidAmount: true } }),
  ])
  const paid = new Map<string, number>()
  for (const p of payments) paid.set(p.payrollName, (paid.get(p.payrollName) ?? 0) + p.paidAmount)
  return new Set(
    receipts.filter((r) => isSendableReceipt(r.status, paid.get(r.payrollName) ?? 0)).map((r) => r.payrollName)
  )
}

async function main() {
  const jun = await prisma.payrollPeriod.findFirst({
    where: { periodStart: { gte: new Date('2026-06-01'), lt: new Date('2026-07-01') } },
    select: { id: true },
  })
  if (!jun) throw new Error('June not found')
  const grid = await getPaymentGrid(jun.id)
  const t = grid[0]
  const before = await sendable(jun.id)
  console.log(`baseline sendable: ${before.size} of ${grid.length}`)

  const original = Object.fromEntries(t.categories.map((c) => [c.componentKey, c.paid]))
  const zero = Object.fromEntries(t.categories.map((c) => [c.componentKey, 0]))
  await savePaymentMarks(jun.id, [{ payrollName: t.payrollName, userId: t.userId, amounts: zero }])
  const held = await sendable(jun.id)
  console.log(`after holding employee #1: sendable=${held.size} (expect ${before.size - 1}), employee still sendable=${held.has(t.payrollName)} (expect false)`)

  await savePaymentMarks(jun.id, [{ payrollName: t.payrollName, userId: t.userId, amounts: original }])
  const restored = await sendable(jun.id)
  console.log(`after restore: sendable=${restored.size} (expect ${before.size})`)
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
```

Run: `npx tsx .tmp-verify-send.ts` then delete it.
Expected: baseline sendable N; after holding, N−1 and the employee is not sendable; after restore, N again.

Note: receipts must be `READY` for them to count as sendable. If June's receipts are already `SENT` from a prior run, the baseline may be 0 — in that case note it and rely on the unit tests for the status dimension; the paid-total dimension is still proven by the drop when held. (Do not send receipts to make them READY.)

- [ ] **Step 6: Browser walkthrough — flag for the user**

The on-screen flow (Approve → Payments hold → Send skips held → pay → re-Send) needs an HR login and a period at APPROVED, and the final step dispatches real HelloSign receipts. This is left for the user to exercise on a real run; do not dispatch receipts during automated verification.

- [ ] **Step 7: Push the branch**

```bash
git push -u origin feat/payments-before-send
```

Do **not** merge to `main` without the user's go-ahead — `main` auto-deploys.

---

## Notes for the implementer

- **No schema, no migration.** If you reach for Prisma migrate, stop.
- **Never dispatch HelloSign receipts to verify** — prove the sendable set by script, not by sending. Real receipts go to real employees.
- **The reorder is index-sensitive:** STEPS order and the `currentStep === N` render guards and the `handleStepClick` warnings must all agree that 4 = Payments, 5 = Send.
- **`npx next build`, not `npm run build`** — the npm script prefixes `prisma migrate deploy`.
- **Payments editable at APPROVED** is the load-bearing change that lets HR finalize before Send; both the API guard (Task 2) and the grid gate (Task 4) must include APPROVED.
