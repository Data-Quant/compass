# Payroll Payments Step Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Payments step (6th, after Send) where HR records per-category paid amounts, and remove the Auto-Paid system so the rolling balance reflects real disbursements instead of an assumption.

**Architecture:** A new `PayrollPayment` table holds one paid-amount row per (period, employee, earning category). A pure helper computes the carried balance from those marks; the same helper drives both the engine (on recalc) and a targeted balance update when HR saves the Payments grid. The engine's `resolvePaidForBalance`/`AUTO_PAID_NET` auto-fill is deleted.

**Tech Stack:** Next.js 15 App Router, Prisma + Neon Postgres, iron-session, Tailwind + shadcn/ui, framer-motion, zod, `node --test` + `tsx`.

**Spec:** `docs/superpowers/specs/2026-07-21-payroll-payments-step-design.md`
**Branch:** `feat/payroll-payments-step` (already created; spec already committed)

## Global Constraints

Every task's requirements implicitly include this section.

- **Additive-first.** New table only; no existing column altered destructively. One additive migration.
- **Public repo** `Data-Quant/compass` — no real names, salary figures, or policy content in source/tests/fixtures. Fixtures use invented data.
- **Local `.env` `DATABASE_URL` points at PRODUCTION Neon.** Every Prisma command hits prod. The migration auto-applies on Vercel build (`prisma migrate deploy`).
- **The migration must be hand-written.** `prisma migrate diff` also emits three unrelated `ALTER INDEX ... RENAME` statements from pre-existing identifier-truncation drift on `EvaluationPeriodAssignment*` / `ProjectNotificationDigestItem`. Excluding them is required (violating this alters unrelated objects).
- **Never run `npx prisma format`** — it reformats the whole 1400-line schema and buries the diff.
- **`npm run lint` is broken repo-wide** (no ESLint config). Verify with `npx tsc --noEmit` and `npx next build` (not `npm run build`, which prefixes `prisma migrate deploy` and hits prod).
- **No test touches the DB.** The balance/payment math is a pure helper, unit-tested with invented data.
- Test one file: `npx tsx --test tests/<file>.test.ts`. All: `npm test` (needs `npm run dev` for `api-integration.test.ts`).
- Windows: the Prisma query-engine DLL locks while a dev server runs; stop dev servers before `npx prisma generate`.

---

## File Structure

| File | Responsibility |
|---|---|
| `prisma/schema.prisma` (modify) | `PayrollPayment` model |
| `prisma/migrations/20260721120000_add_payroll_payment/migration.sql` (create) | Hand-written additive migration |
| `lib/payroll/payments.ts` (create) | Pure helpers: payable keys, carried-balance, paid total, status. No Prisma. |
| `tests/payroll-payments.test.ts` (create) | Unit tests for the pure helpers |
| `lib/payroll/engine.ts` (modify) | Remove Auto-Paid; compute balance from payments-or-zero |
| `tests/payroll-engine.test.ts` (modify) | Drop the retired `resolvePaidForBalance` tests |
| `lib/payroll/payment-queries.ts` (create) | Prisma reads/writes for payments + targeted balance update |
| `app/api/payroll/periods/[id]/payments/route.ts` (create) | GET rows, PUT marks (HR+O&A, SENT only) |
| `app/api/payroll/periods/[id]/route.ts` (modify) | Add `payments` to the period include |
| `components/payroll/PayrollPaymentsGrid.tsx` (create) | The Payments table |
| `components/payroll/PayrollRunWizard.tsx` (modify) | 6th step, `WizardStep` widened, gating |
| `scripts/backfill-payroll-payments.ts` (create) | One-time: seed May/June full-paid, drop `AUTO_PAID_NET` rows |

---

## Task 1: `PayrollPayment` schema + migration

**Files:** modify `prisma/schema.prisma`; create `prisma/migrations/20260721120000_add_payroll_payment/migration.sql`

**Interfaces:**
- Produces: Prisma model `PayrollPayment` with fields `id, periodId, payrollName, userId?, componentKey, paidAmount, createdAt, updatedAt`, unique `[periodId, payrollName, componentKey]`.

- [ ] **Step 1: Add the model to the schema**

Find `model PayrollReceipt` in `prisma/schema.prisma`. Immediately after its closing `}`, add:

```prisma
/// One recorded paid amount per (period, employee, earning category). Drives the
/// rolling balance in the Payments step (after Send). Replaces the retired
/// single PAID input + Auto-Paid default.
model PayrollPayment {
  id           String        @id @default(cuid())
  periodId     String
  payrollName  String
  userId       String?
  componentKey String
  paidAmount   Float         @default(0)
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  period       PayrollPeriod @relation(fields: [periodId], references: [id], onDelete: Cascade)

  @@unique([periodId, payrollName, componentKey])
  @@index([periodId])
}
```

Then add the back-relation to `model PayrollPeriod`. Find the `payments`-adjacent relation list in `PayrollPeriod` (it already lists `receipts`, `computedValues`, etc.) and add one line:

```prisma
  payments      PayrollPayment[]
```

Do **not** run `npx prisma format`.

- [ ] **Step 2: Confirm the schema diff is additive**

Run: `git diff -w --stat prisma/schema.prisma`
Expected: one file changed, ~16 insertions, **0 deletions**. Deletions mean you reformatted — `git checkout prisma/schema.prisma` and redo Step 1.

- [ ] **Step 3: Inspect what Prisma would generate (do not use directly)**

Run: `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script`
Expected: a `CREATE TABLE "PayrollPayment"`, its unique index and FK — **plus** three unrelated `ALTER INDEX ... RENAME` statements (pre-existing drift). Those three are not yours; exclude them.

- [ ] **Step 4: Hand-write the migration**

Create `prisma/migrations/20260721120000_add_payroll_payment/migration.sql`:

```sql
-- Payroll Payments: additive only.
--
-- Hand-written. `prisma migrate diff` also emits three ALTER INDEX ... RENAME
-- statements for EvaluationPeriodAssignmentOverride,
-- EvaluationPeriodAssignmentSnapshot and ProjectNotificationDigestItem. That is
-- PRE-EXISTING identifier-truncation drift on unrelated tables, deliberately
-- excluded -- this migration must not alter anything that already exists.

-- CreateTable
CREATE TABLE "PayrollPayment" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "payrollName" TEXT NOT NULL,
    "userId" TEXT,
    "componentKey" TEXT NOT NULL,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPayment_periodId_payrollName_componentKey_key" ON "PayrollPayment"("periodId", "payrollName", "componentKey");

-- CreateIndex
CREATE INDEX "PayrollPayment_periodId_idx" ON "PayrollPayment"("periodId");

-- AddForeignKey
ALTER TABLE "PayrollPayment" ADD CONSTRAINT "PayrollPayment_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

Compare the exact identifiers/types against the Step 3 output; copy them verbatim so they match what Prisma expects.

- [ ] **Step 5: Regenerate the client**

Stop any dev server first (Windows DLL lock). Run: `npx prisma generate`
Expected: `Generated Prisma Client`. Does not touch the DB.

- [ ] **Step 6: Apply to production**

Run: `npx prisma migrate deploy`
Expected: `Applying migration '20260721120000_add_payroll_payment'` … `migration applied`. On `P1002` (advisory lock) wait 30s and retry once.

- [ ] **Step 7: Verify the table exists and is empty**

Run:
```bash
npx tsx -e "import{prisma}from'./lib/db';prisma.payrollPayment.count().then(n=>{console.log('PayrollPayment rows:',n);process.exit(0)})"
```
Expected: `PayrollPayment rows: 0`.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260721120000_add_payroll_payment
git commit -m "feat: add PayrollPayment table

One recorded paid amount per (period, employee, earning category). Additive
migration, hand-written to exclude pre-existing unrelated index-rename drift.
Drives the rolling balance from real disbursements once Auto-Paid is removed."
```

---

## Task 2: Pure payment helpers

**Files:** create `lib/payroll/payments.ts`; test `tests/payroll-payments.test.ts`

**Interfaces:**
- Produces:
  - `PAYABLE_EARNING_KEYS: readonly string[]`
  - `type PaymentCategory = { computed: number; paid: number }`
  - `type PaymentStatus = 'PAID' | 'PARTIAL' | 'PENDING'`
  - `computeCarriedBalance(previousBalance: number, categories: PaymentCategory[]): number`
  - `computePaidTotal(categories: PaymentCategory[]): number`
  - `paymentStatus(categories: PaymentCategory[]): PaymentStatus`

The carried balance equals `previousBalance + Σ(computed − paid)`; spec §3.2. Deductions never enter — only payable earnings are categories.

- [ ] **Step 1: Write the failing test**

Create `tests/payroll-payments.test.ts` (invented amounts, C2):

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeCarriedBalance,
  computePaidTotal,
  paymentStatus,
  PAYABLE_EARNING_KEYS,
  type PaymentCategory,
} from '../lib/payroll/payments'

const cat = (computed: number, paid: number): PaymentCategory => ({ computed, paid })

test('all categories paid in full carries only the previous balance', () => {
  const cats = [cat(50_000, 50_000), cat(5_000, 5_000)]
  assert.equal(computeCarriedBalance(0, cats), 0)
  assert.equal(computeCarriedBalance(3_000, cats), 3_000)
})

test('a held-back category carries as balance on top of previous', () => {
  const cats = [cat(50_000, 50_000), cat(5_000, 0)] // travel not paid
  assert.equal(computeCarriedBalance(0, cats), 5_000)
  assert.equal(computeCarriedBalance(2_000, cats), 7_000)
})

test('nothing paid carries the full computed earnings', () => {
  const cats = [cat(50_000, 0), cat(5_000, 0)]
  assert.equal(computeCarriedBalance(0, cats), 55_000)
})

test('computePaidTotal sums the paid amounts', () => {
  assert.equal(computePaidTotal([cat(50_000, 40_000), cat(5_000, 5_000)]), 45_000)
})

test('paymentStatus: PAID when total paid >= total computed', () => {
  assert.equal(paymentStatus([cat(50_000, 50_000), cat(5_000, 5_000)]), 'PAID')
})

test('paymentStatus: PENDING when nothing is paid', () => {
  assert.equal(paymentStatus([cat(50_000, 0), cat(5_000, 0)]), 'PENDING')
})

test('paymentStatus: PARTIAL when some but not all is paid', () => {
  assert.equal(paymentStatus([cat(50_000, 50_000), cat(5_000, 0)]), 'PARTIAL')
})

test('PAYABLE_EARNING_KEYS holds the earning categories and no deductions', () => {
  assert.ok(PAYABLE_EARNING_KEYS.includes('BASIC_SALARY'))
  assert.ok(PAYABLE_EARNING_KEYS.includes('TRAVEL_REIMBURSEMENT'))
  assert.ok(!PAYABLE_EARNING_KEYS.includes('INCOME_TAX'))
  assert.ok(!PAYABLE_EARNING_KEYS.includes('PAID'))
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx tsx --test tests/payroll-payments.test.ts`
Expected: FAIL — `Cannot find module '../lib/payroll/payments'`

- [ ] **Step 3: Write `lib/payroll/payments.ts`**

```ts
/**
 * Pure payment math for the Payments step. No Prisma — testable without a DB.
 *
 * The rolling balance is previousBalance + Σ(computed − paid) over payable
 * earning categories. Deductions are withheld, not disbursed, so they are not
 * categories here and never affect the balance (spec §3.2).
 */

/** Earning line items that can be marked as paid. Order is display order. */
export const PAYABLE_EARNING_KEYS = [
  'BASIC_SALARY',
  'MEDICAL_ALLOWANCE',
  'BONUS',
  'TRAVEL_REIMBURSEMENT',
  'MOBILE_REIMBURSEMENT',
  'UTILITY_REIMBURSEMENT',
  'MEALS_REIMBURSEMENT',
  'EXPENSE_REIMBURSEMENT',
  'ADVANCE_LOAN',
] as const

export type PaymentCategory = { computed: number; paid: number }
export type PaymentStatus = 'PAID' | 'PARTIAL' | 'PENDING'

export function computeCarriedBalance(
  previousBalance: number,
  categories: PaymentCategory[]
): number {
  return categories.reduce((sum, c) => sum + (c.computed - c.paid), previousBalance)
}

export function computePaidTotal(categories: PaymentCategory[]): number {
  return categories.reduce((sum, c) => sum + c.paid, 0)
}

export function paymentStatus(categories: PaymentCategory[]): PaymentStatus {
  const totalComputed = categories.reduce((s, c) => s + c.computed, 0)
  const totalPaid = categories.reduce((s, c) => s + c.paid, 0)
  if (totalPaid <= 0) return 'PENDING'
  if (totalPaid >= totalComputed) return 'PAID'
  return 'PARTIAL'
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx tsx --test tests/payroll-payments.test.ts`
Expected: PASS — 8 tests, 0 failures.

- [ ] **Step 5: Commit**

```bash
git add lib/payroll/payments.ts tests/payroll-payments.test.ts
git commit -m "feat: add pure payment-balance helpers

Carried balance = previousBalance + sum(computed - paid) over payable earning
categories. Deductions are not categories and never affect the balance. Pure,
unit-tested without a database."
```

---

## Task 3: Remove Auto-Paid from the engine

**Files:** modify `lib/payroll/engine.ts`, `tests/payroll-engine.test.ts`

**Interfaces:**
- Consumes: `PAYABLE_EARNING_KEYS`, `computeCarriedBalance`, `PaymentCategory` (Task 2).
- Removes (no longer exported): `resolvePaidForBalance`, `AUTO_PAID_NET`, `ExistingPaidInput`.

The engine no longer auto-fills PAID. On recalc it reads any `PayrollPayment` rows for the period; when present, the balance is payment-driven, else it is the full net owed.

- [ ] **Step 1: Load payments alongside inputs**

In `lib/payroll/engine.ts`, the `Promise.all([...])` at the top of `recalculatePayrollPeriod` fetches `inputs`, `activeFinancialYear`, etc. Add a `payments` fetch to that array:

```ts
    prisma.payrollPayment.findMany({
      where: { periodId },
      select: { payrollName: true, componentKey: true, paidAmount: true },
    }),
```

Destructure it as the new last element, e.g. `const [inputs, activeFinancialYear, salaryHeads, holidays, travelTiers, payments] = await Promise.all([...])`. Then build a lookup near `previousBalanceMap`:

```ts
  // paid amounts recorded in the Payments step, per employee per category.
  const paidByPayroll = new Map<string, Map<string, number>>()
  for (const p of payments) {
    const inner = paidByPayroll.get(p.payrollName) ?? new Map<string, number>()
    inner.set(p.componentKey, p.paidAmount)
    paidByPayroll.set(p.payrollName, inner)
  }
```

Add the import at the top:

```ts
import { PAYABLE_EARNING_KEYS, computeCarriedBalance, type PaymentCategory } from '@/lib/payroll/payments'
```

- [ ] **Step 2: Replace the paid/balance block**

Replace the current block (engine.ts, the `paidRow` … `const balance = previousBalance + netSalary - paid` section, ~lines 495-519) with:

```ts
    const previousBalance = previousBalanceMap.get(payrollName) || 0
    const recordedPaid = paidByPayroll.get(payrollName)
    let paid: number
    let balance: number
    if (recordedPaid) {
      // Payments have been recorded: the balance carries the unpaid earnings.
      const categories: PaymentCategory[] = PAYABLE_EARNING_KEYS.map((key) => ({
        computed: getNumber(bucket, key),
        paid: recordedPaid.get(key) ?? 0,
      }))
      balance = computeCarriedBalance(previousBalance, categories)
      paid = netSalary - (balance - previousBalance) // net-equivalent disbursed, for the receipt
    } else {
      // No payments recorded yet: the full net is owed.
      paid = 0
      balance = previousBalance + netSalary
    }
```

- [ ] **Step 3: Remove the reconcile-net-vs-paid call**

Delete the two lines:

```ts
    const mismatch = reconcileNetVsPaid(payrollName, periodKey, netSalary, paid, tolerance)
    if (mismatch) mismatches.push(mismatch)
```

Remove `reconcileNetVsPaid` from the import on line 3 (keep `PayrollReconciliationMismatch` — the `mismatches` array is still used by travel/other checks). If nothing else references `tolerance`, leave the parameter (it is part of the public signature and other reconcilers may use it).

- [ ] **Step 4: Delete the retired helpers and lineage fix**

Delete from `lib/payroll/engine.ts`:
- `export const AUTO_PAID_NET = 'AUTO_PAID_NET'`
- `export type ExistingPaidInput = { ... }`
- the entire `export function resolvePaidForBalance(...) { ... }`
- the `readGeneratedBy` helper (only used by the deleted code — confirm with `grep -n readGeneratedBy lib/payroll/engine.ts`, remove if the only hit is its definition)

In `lib/payroll/formula-registry.ts`, remove the `PAID_DEFAULTS_NET: 'FIX_PAID_DEFAULTS_NET_V1',` line. In `engine.ts`, remove `FIX_IDS.PAID_DEFAULTS_NET,` from the `fixes` array in the lineage.

- [ ] **Step 5: Drop the retired engine tests**

In `tests/payroll-engine.test.ts`, remove `resolvePaidForBalance` and `AUTO_PAID_NET` from the import, and delete the five `resolvePaidForBalance ...` tests (the block after the `─── resolvePaidForBalance ───` comment). Leave every other test untouched.

- [ ] **Step 6: Typecheck and run the payroll tests**

Run: `npx tsc --noEmit && npx tsx --test tests/payroll-*.test.ts 2>&1 | grep -E "^. (tests|pass|fail) "`
Expected: tsc clean; all pass (57 baseline − 5 removed + 8 new from Task 2 = 60).

- [ ] **Step 7: Commit**

```bash
git add lib/payroll/engine.ts lib/payroll/formula-registry.ts tests/payroll-engine.test.ts
git commit -m "refactor: remove Auto-Paid; balance now driven by recorded payments

Deletes resolvePaidForBalance / AUTO_PAID_NET / the net-vs-paid reconcile call.
A freshly calculated period shows the full net as owed; once payments are
recorded the balance carries the unpaid earnings, via the shared
computeCarriedBalance helper. Auto-Paid's assumption is gone."
```

---

## Task 4: Payment queries + API

**Files:** create `lib/payroll/payment-queries.ts`, `app/api/payroll/periods/[id]/payments/route.ts`; modify `app/api/payroll/periods/[id]/route.ts`

**Interfaces:**
- Consumes: `PAYABLE_EARNING_KEYS`, `computeCarriedBalance`, `computePaidTotal`, `paymentStatus` (Task 2).
- Produces:
  - `getPaymentGrid(periodId): Promise<PaymentGridRow[]>` where `PaymentGridRow = { payrollName: string; userId: string | null; netSalary: number; previousBalance: number; categories: { componentKey: string; computed: number; paid: number }[]; paidTotal: number; balance: number; status: PaymentStatus }`
  - `savePaymentMarks(periodId, marks): Promise<void>` where `marks = { payrollName: string; userId: string | null; amounts: Record<string, number> }[]`
  - `GET /api/payroll/periods/[id]/payments` → `{ rows: PaymentGridRow[] }`
  - `PUT /api/payroll/periods/[id]/payments` body `{ marks }` → `{ success: true }`

Saving upserts `PayrollPayment` rows and does a **targeted update** of each employee's `BALANCE` computed value + receipt `net.balance` — no engine recalc.

- [ ] **Step 1: Write `lib/payroll/payment-queries.ts`**

```ts
import { prisma } from '@/lib/db'
import {
  PAYABLE_EARNING_KEYS,
  computeCarriedBalance,
  computePaidTotal,
  paymentStatus,
  type PaymentStatus,
} from '@/lib/payroll/payments'

export type PaymentGridRow = {
  payrollName: string
  userId: string | null
  netSalary: number
  previousBalance: number
  categories: { componentKey: string; computed: number; paid: number }[]
  paidTotal: number
  balance: number
  status: PaymentStatus
}

export type PaymentMark = {
  payrollName: string
  userId: string | null
  amounts: Record<string, number>
}

/** The previous period's carried BALANCE per employee, this period's opening balance. */
async function previousBalanceMap(periodStart: Date): Promise<Map<string, number>> {
  const prev = await prisma.payrollPeriod.findFirst({
    where: { periodStart: { lt: periodStart } },
    orderBy: { periodStart: 'desc' },
    select: { id: true },
  })
  if (!prev) return new Map()
  const rows = await prisma.payrollComputedValue.findMany({
    where: { periodId: prev.id, metricKey: 'BALANCE' },
    select: { payrollName: true, amount: true },
  })
  return new Map(rows.map((r) => [r.payrollName, r.amount]))
}

export async function getPaymentGrid(periodId: string): Promise<PaymentGridRow[]> {
  const period = await prisma.payrollPeriod.findUnique({
    where: { id: periodId },
    select: { periodStart: true },
  })
  if (!period) return []

  const [receipts, payments, prevBalances] = await Promise.all([
    prisma.payrollReceipt.findMany({
      where: { periodId },
      select: { payrollName: true, userId: true, receiptJson: true },
      orderBy: { payrollName: 'asc' },
    }),
    prisma.payrollPayment.findMany({
      where: { periodId },
      select: { payrollName: true, componentKey: true, paidAmount: true },
    }),
    previousBalanceMap(period.periodStart),
  ])

  const paidByPayroll = new Map<string, Map<string, number>>()
  for (const p of payments) {
    const inner = paidByPayroll.get(p.payrollName) ?? new Map()
    inner.set(p.componentKey, p.paidAmount)
    paidByPayroll.set(p.payrollName, inner)
  }
  const hasRecords = new Set(payments.map((p) => p.payrollName))

  return receipts.map((r) => {
    const json = (r.receiptJson ?? {}) as {
      earnings?: Record<string, number>
      net?: { netSalary?: number }
    }
    const earnings = json.earnings ?? {}
    const netSalary = json.net?.netSalary ?? 0
    const previousBalance = prevBalances.get(r.payrollName) ?? 0
    const recorded = paidByPayroll.get(r.payrollName)
    // Default each cell to the computed amount when nothing is recorded yet.
    const categories = PAYABLE_EARNING_KEYS.map((key) => {
      const computed = computedForKey(earnings, key)
      const paid = hasRecords.has(r.payrollName)
        ? recorded?.get(key) ?? 0
        : computed
      return { componentKey: key, computed, paid }
    })
    return {
      payrollName: r.payrollName,
      userId: r.userId,
      netSalary,
      previousBalance,
      categories,
      paidTotal: computePaidTotal(categories),
      balance: computeCarriedBalance(previousBalance, categories),
      status: paymentStatus(categories),
    }
  })
}

/** Map a PAYABLE_EARNING_KEYS entry to its receiptJson.earnings field. */
function computedForKey(earnings: Record<string, number>, key: string): number {
  const map: Record<string, string> = {
    BASIC_SALARY: 'basicSalary',
    MEDICAL_ALLOWANCE: 'medicalAllowance',
    BONUS: 'bonus',
    TRAVEL_REIMBURSEMENT: 'travelReimbursement',
    MOBILE_REIMBURSEMENT: 'mobileReimbursement',
    UTILITY_REIMBURSEMENT: 'utilityReimbursement',
    MEALS_REIMBURSEMENT: 'mealsReimbursement',
    EXPENSE_REIMBURSEMENT: 'expenseReimbursement',
    ADVANCE_LOAN: 'advanceLoan',
  }
  const field = map[key]
  const v = field ? earnings[field] : 0
  return Number.isFinite(v) ? Number(v) : 0
}

export async function savePaymentMarks(periodId: string, marks: PaymentMark[]): Promise<void> {
  const period = await prisma.payrollPeriod.findUnique({
    where: { id: periodId },
    select: { periodStart: true },
  })
  if (!period) throw new Error('Payroll period not found')
  const prevBalances = await previousBalanceMap(period.periodStart)

  const grid = await getPaymentGrid(periodId)
  const computedByPayroll = new Map(grid.map((g) => [g.payrollName, g]))

  await prisma.$transaction(
    async (tx) => {
      for (const mark of marks) {
        const row = computedByPayroll.get(mark.payrollName)
        if (!row) continue

        // Upsert one PayrollPayment per payable category.
        for (const key of PAYABLE_EARNING_KEYS) {
          const paidAmount = Number(mark.amounts[key] ?? 0)
          await tx.payrollPayment.upsert({
            where: {
              periodId_payrollName_componentKey: {
                periodId,
                payrollName: mark.payrollName,
                componentKey: key,
              },
            },
            create: {
              periodId,
              payrollName: mark.payrollName,
              userId: mark.userId,
              componentKey: key,
              paidAmount,
            },
            update: { paidAmount, userId: mark.userId },
          })
        }

        // Targeted balance update — no engine recalc.
        const categories = PAYABLE_EARNING_KEYS.map((key) => ({
          computed: row.categories.find((c) => c.componentKey === key)?.computed ?? 0,
          paid: Number(mark.amounts[key] ?? 0),
        }))
        const previousBalance = prevBalances.get(mark.payrollName) ?? 0
        const balance = computeCarriedBalance(previousBalance, categories)

        await tx.payrollComputedValue.updateMany({
          where: { periodId, payrollName: mark.payrollName, metricKey: 'BALANCE' },
          data: { amount: balance },
        })

        const receipt = await tx.payrollReceipt.findUnique({
          where: { periodId_payrollName: { periodId, payrollName: mark.payrollName } },
          select: { receiptJson: true },
        })
        if (receipt) {
          const json = (receipt.receiptJson ?? {}) as Record<string, unknown>
          const net = (json.net ?? {}) as Record<string, unknown>
          json.net = { ...net, previousBalance, balance }
          await tx.payrollReceipt.update({
            where: { periodId_payrollName: { periodId, payrollName: mark.payrollName } },
            data: { receiptJson: json as never },
          })
        }
      }
    },
    { timeout: 60_000, maxWait: 10_000 }
  )
}
```

- [ ] **Step 2: Write the API route**

Create `app/api/payroll/periods/[id]/payments/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { canManagePayroll } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { getPaymentGrid, savePaymentMarks } from '@/lib/payroll/payment-queries'

const SENT_STATUSES = new Set(['SENDING', 'SENT', 'PARTIAL', 'LOCKED'])

const bodySchema = z.object({
  marks: z.array(
    z.object({
      payrollName: z.string().trim().min(1),
      userId: z.string().nullable(),
      amounts: z.record(z.string(), z.number()),
    })
  ),
})

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession()
    if (!user || !canManagePayroll(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { id } = await params
    const rows = await getPaymentGrid(id)
    return NextResponse.json({ rows })
  } catch (error) {
    console.error('Failed to load payments:', error)
    return NextResponse.json({ error: 'Failed to load payments' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession()
    if (!user || !canManagePayroll(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { id } = await params

    const period = await prisma.payrollPeriod.findUnique({
      where: { id },
      select: { status: true },
    })
    if (!period) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    // Payments are recorded only after the run has been sent.
    if (!SENT_STATUSES.has(period.status)) {
      return NextResponse.json(
        { error: 'Send the payroll before recording payments' },
        { status: 400 }
      )
    }

    const parsed = bodySchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid payment data' }, { status: 400 })
    }

    await savePaymentMarks(id, parsed.data.marks)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to save payments:', error)
    return NextResponse.json({ error: 'Failed to save payments' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Add `payments` to the period include**

In `app/api/payroll/periods/[id]/route.ts`, the `GET` handler's `prisma.payrollPeriod.findUnique({ include: { ... } })` lists `receipts`, `computedValues`, etc. Add:

```ts
        payments: { orderBy: [{ payrollName: 'asc' }, { componentKey: 'asc' }] },
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Verify the guards**

Start `npm run dev`. With no session cookie:
```bash
curl -s -o /dev/null -w "GET payments (no session): %{http_code}\n" "http://localhost:3000/api/payroll/periods/anyid/payments"
```
Expected: `401`.

- [ ] **Step 6: Commit**

```bash
git add lib/payroll/payment-queries.ts app/api/payroll/periods/ && git commit -m "feat: add Payments query + API

GET builds the grid (each cell defaults to the computed amount when nothing is
recorded); PUT upserts PayrollPayment rows and does a targeted BALANCE + receipt
update, no engine recalc. HR + O&A only, and only once the period is sent."
```

---

## Task 5: The Payments wizard step

**Files:** create `components/payroll/PayrollPaymentsGrid.tsx`; modify `components/payroll/PayrollRunWizard.tsx`

**Interfaces:**
- Consumes: `GET/PUT /api/payroll/periods/[id]/payments` (Task 4); `PAYABLE_EARNING_KEYS` (Task 2).
- Produces: the 6th wizard step.

- [ ] **Step 1: Write `components/payroll/PayrollPaymentsGrid.tsx`**

```tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const CATEGORY_LABELS: Record<string, string> = {
  BASIC_SALARY: 'Basic',
  MEDICAL_ALLOWANCE: 'Medical',
  BONUS: 'Bonus',
  TRAVEL_REIMBURSEMENT: 'Travel',
  MOBILE_REIMBURSEMENT: 'Mobile',
  UTILITY_REIMBURSEMENT: 'Utility',
  MEALS_REIMBURSEMENT: 'Meals',
  EXPENSE_REIMBURSEMENT: 'Reimb.',
  ADVANCE_LOAN: 'Advance',
}

type Category = { componentKey: string; computed: number; paid: number }
type Row = {
  payrollName: string
  userId: string | null
  netSalary: number
  previousBalance: number
  categories: Category[]
  paidTotal: number
  balance: number
  status: 'PAID' | 'PARTIAL' | 'PENDING'
}

const money = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 0 })

const STATUS_STYLE: Record<Row['status'], string> = {
  PAID: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  PARTIAL: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  PENDING: 'bg-muted text-muted-foreground',
}

export function PayrollPaymentsGrid({
  periodId,
  editable,
  onSaved,
}: {
  periodId: string
  editable: boolean
  onSaved?: () => void
}) {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // paid overrides keyed by `${payrollName}|${componentKey}`
  const [edits, setEdits] = useState<Record<string, number>>({})

  useEffect(() => {
    fetch(`/api/payroll/periods/${periodId}/payments`)
      .then((r) => r.json())
      .then((d) => setRows(d.rows || []))
      .catch(() => toast.error('Failed to load payments'))
      .finally(() => setLoading(false))
  }, [periodId])

  const keys = rows[0]?.categories.map((c) => c.componentKey) ?? []

  const paidFor = (row: Row, key: string) => {
    const k = `${row.payrollName}|${key}`
    if (k in edits) return edits[k]
    return row.categories.find((c) => c.componentKey === key)?.paid ?? 0
  }

  // Live-derived paid/balance so HR sees the effect as they type.
  const derived = useMemo(() => {
    const out: Record<string, { paidTotal: number; balance: number }> = {}
    for (const row of rows) {
      let paidTotal = 0
      let unpaid = 0
      for (const c of row.categories) {
        const p = paidFor(row, c.componentKey)
        paidTotal += p
        unpaid += c.computed - p
      }
      out[row.payrollName] = { paidTotal, balance: row.previousBalance + unpaid }
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, edits])

  const setCell = (payrollName: string, key: string, value: string) => {
    const n = Number(value)
    setEdits((prev) => ({ ...prev, [`${payrollName}|${key}`]: Number.isFinite(n) ? n : 0 }))
  }

  const save = async () => {
    setSaving(true)
    try {
      const marks = rows.map((row) => ({
        payrollName: row.payrollName,
        userId: row.userId,
        amounts: Object.fromEntries(row.categories.map((c) => [c.componentKey, paidFor(row, c.componentKey)])),
      }))
      const res = await fetch(`/api/payroll/periods/${periodId}/payments`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marks }),
      })
      const data = await res.json()
      if (data.error) {
        toast.error(data.error)
        return
      }
      toast.success('Payments saved')
      setEdits({})
      // Reload to reflect persisted balances.
      const fresh = await fetch(`/api/payroll/periods/${periodId}/payments`).then((r) => r.json())
      setRows(fresh.rows || [])
      onSaved?.()
    } catch {
      toast.error('Failed to save payments')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-card border border-border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="sticky left-0 bg-muted/50">Employee</TableHead>
              {keys.map((k) => (
                <TableHead key={k} className="text-right whitespace-nowrap">
                  {CATEGORY_LABELS[k] ?? k}
                </TableHead>
              ))}
              <TableHead className="text-right">Paid</TableHead>
              <TableHead className="text-right">Balance</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const d = derived[row.payrollName]
              const status = d.balance <= 0 ? 'PAID' : d.paidTotal <= 0 ? 'PENDING' : 'PARTIAL'
              return (
                <TableRow key={row.payrollName}>
                  <TableCell className="font-medium text-sm sticky left-0 bg-background">
                    {row.payrollName}
                  </TableCell>
                  {row.categories.map((c) => (
                    <TableCell key={c.componentKey} className="text-right p-1">
                      <Input
                        type="number"
                        value={paidFor(row, c.componentKey)}
                        disabled={!editable}
                        onChange={(e) => setCell(row.payrollName, c.componentKey, e.target.value)}
                        className="h-8 w-24 text-right tabular-nums ml-auto"
                      />
                    </TableCell>
                  ))}
                  <TableCell className="text-right tabular-nums text-sm">{money(d.paidTotal)}</TableCell>
                  <TableCell className="text-right tabular-nums text-sm font-semibold">
                    {money(d.balance)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={cn('text-[10px]', STATUS_STYLE[status])}>
                      {status}
                    </Badge>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {editable && (
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save Payments
          </Button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Widen the wizard step type and add the step label**

In `components/payroll/PayrollRunWizard.tsx`:

Change the type:
```ts
type WizardStep = 0 | 1 | 2 | 3 | 4 | 5
```

Add to the `STEPS` array after the `Send` entry:
```ts
  { label: 'Payments', description: 'Record what was actually paid' },
```

- [ ] **Step 3: Render the Payments step**

Import the grid near the other component imports:
```ts
import { PayrollPaymentsGrid } from '@/components/payroll/PayrollPaymentsGrid'
```

After the `{currentStep === 4 && (...)}` Send block, add:

```tsx
          {/* Step 5: Payments */}
          {currentStep === 5 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold font-display">Payments</h2>
                <p className="text-sm text-muted-foreground">
                  Record what was actually paid, per category. Each cell defaults to the computed
                  amount — adjust anything not yet disbursed. Unpaid amounts carry as balance.
                </p>
              </div>
              <PayrollPaymentsGrid
                periodId={periodId}
                editable={['SENDING', 'SENT', 'PARTIAL', 'LOCKED'].includes(period.status)}
                onSaved={onReload}
              />
            </div>
          )}
```

- [ ] **Step 4: Gate navigation to Payments**

In `handleStepClick`, add a warning like the Send one:

```ts
    if (step === 5 && period.status !== 'SENT' && period.status !== 'SENDING' && period.status !== 'PARTIAL' && period.status !== 'LOCKED') {
      toast.warning('Send the payroll before recording payments')
    }
```

- [ ] **Step 5: Typecheck and build**

Run: `npx tsc --noEmit && npx next build 2>&1 | grep -iE "Compiled|error|Failed" | head -5`
Expected: `Compiled successfully`, no errors.

- [ ] **Step 6: Browser verification**

Sign in with an HR account. Open a payroll period that is SENT (May/June after the backfill in Task 6, or a fresh run taken through Send). Open the **Payments** step. Confirm:
1. It shows one row per employee, a column per earning category, each cell pre-filled with the computed amount.
2. Paid = sum of cells; Balance and Status update live as you edit a cell.
3. Reduce one category → Balance rises by that amount; status → Partial.
4. Save → toast; reload the page → the balance persisted.
5. As a non-SENT period, the step warns and cells are read-only.

- [ ] **Step 7: Commit**

```bash
git add components/payroll/PayrollPaymentsGrid.tsx components/payroll/PayrollRunWizard.tsx
git commit -m "feat: add the Payments wizard step

Sixth step after Send. Same table idiom as the employee grid: a paid-amount
cell per earning category, each defaulting to the computed amount; Paid,
Balance and status derive live. Editable by HR + O&A once the period is sent."
```

---

## Task 6: Backfill existing periods

**Files:** create `scripts/backfill-payroll-payments.ts`

Seeds `PayrollPayment` at full-paid for every SENT/approved period so their balances stay 0 through the switch, and removes the now-retired `AUTO_PAID_NET` input rows. One-time, run locally against prod.

**Interfaces:**
- Consumes: `PAYABLE_EARNING_KEYS` (Task 2).

- [ ] **Step 1: Write the script**

Create `scripts/backfill-payroll-payments.ts`:

```ts
import { prisma } from '../lib/db'
import { PAYABLE_EARNING_KEYS } from '../lib/payroll/payments'

// One-time: for every non-DRAFT period, seed a PayrollPayment per payable
// earning category at the computed amount (fully paid), preserving current
// zero balances as Auto-Paid is retired. Then delete AUTO_PAID_NET input rows.
async function main() {
  const periods = await prisma.payrollPeriod.findMany({
    where: { status: { not: 'DRAFT' } },
    select: { id: true, periodStart: true, status: true },
    orderBy: { periodStart: 'asc' },
  })

  const earningField: Record<string, string> = {
    BASIC_SALARY: 'basicSalary',
    MEDICAL_ALLOWANCE: 'medicalAllowance',
    BONUS: 'bonus',
    TRAVEL_REIMBURSEMENT: 'travelReimbursement',
    MOBILE_REIMBURSEMENT: 'mobileReimbursement',
    UTILITY_REIMBURSEMENT: 'utilityReimbursement',
    MEALS_REIMBURSEMENT: 'mealsReimbursement',
    EXPENSE_REIMBURSEMENT: 'expenseReimbursement',
    ADVANCE_LOAN: 'advanceLoan',
  }

  for (const p of periods) {
    const receipts = await prisma.payrollReceipt.findMany({
      where: { periodId: p.id },
      select: { payrollName: true, userId: true, receiptJson: true },
    })
    let created = 0
    for (const r of receipts) {
      const earnings = ((r.receiptJson as { earnings?: Record<string, number> })?.earnings) ?? {}
      for (const key of PAYABLE_EARNING_KEYS) {
        const amount = Number(earnings[earningField[key]] ?? 0)
        await prisma.payrollPayment.upsert({
          where: {
            periodId_payrollName_componentKey: {
              periodId: p.id,
              payrollName: r.payrollName,
              componentKey: key,
            },
          },
          create: {
            periodId: p.id,
            payrollName: r.payrollName,
            userId: r.userId,
            componentKey: key,
            paidAmount: amount,
          },
          update: { paidAmount: amount },
        })
        created++
      }
    }
    const removed = await prisma.payrollInputValue.deleteMany({
      where: {
        periodId: p.id,
        componentKey: 'PAID',
        provenanceJson: { path: ['generatedBy'], equals: 'AUTO_PAID_NET' },
      },
    })
    console.log(
      `${p.periodStart.toISOString().slice(0, 7)} [${p.status}]: ${receipts.length} employees, ${created} payment rows seeded, ${removed.count} AUTO_PAID_NET inputs removed`
    )
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Run it against production**

Run: `npx tsx scripts/backfill-payroll-payments.ts`
Expected: a line per non-draft period (2026-05, 2026-06) with employees, seeded rows (= employees × 9 payable keys), and the count of removed `AUTO_PAID_NET` inputs.

- [ ] **Step 3: Verify balances are unchanged (still 0)**

Run:
```bash
npx tsx -e "import{prisma}from'./lib/db';prisma.payrollComputedValue.count({where:{metricKey:'BALANCE',amount:{not:0}}}).then(n=>{console.log('non-zero balances:',n,'(expect 0)');process.exit(0)})"
```
Expected: `non-zero balances: 0`. The Payments step now shows May/June fully paid, balances still 0. If any balance moved, stop and investigate before committing.

- [ ] **Step 4: Commit**

```bash
git add scripts/backfill-payroll-payments.ts
git commit -m "chore: backfill PayrollPayment full-paid for existing periods

Seeds one paid row per payable category at the computed amount for every
non-draft period, preserving the current zero balances as Auto-Paid is retired,
and removes the AUTO_PAID_NET input rows it superseded."
```

---

## Task 7: Full verification

**Files:** none — verification only.

- [ ] **Step 1: Whole test suite**

Start `npm run dev` in another terminal, then:
Run: `npm test 2>&1 | grep -E "^. (tests|pass|fail) "`
Expected: all pass. Baseline 393 − 5 retired + 8 (Task 2) = **396**.

- [ ] **Step 2: Typecheck and build**

Run: `npx tsc --noEmit && npx next build 2>&1 | grep -iE "payroll|Compiled successfully|error|Failed" | head`
Expected: clean; the `/api/payroll/periods/[id]/payments` route listed.

- [ ] **Step 3: Confirm the migration is the only schema change (additive)**

```bash
git diff main..HEAD --name-only -- prisma/
```
Expected: exactly `prisma/schema.prisma` and the new migration dir.

```bash
grep -icE "DROP|ALTER COLUMN|RENAME" prisma/migrations/20260721120000_add_payroll_payment/migration.sql
```
Expected: `0` (the word RENAME only appears if you left the drift comment — confirm it is inside a `--` comment, not a statement).

- [ ] **Step 4: Confirm nothing sensitive was committed**

```bash
git diff main..HEAD -- ':(exclude)docs/' | grep -icE "PKR [0-9]|real employee names|plutus21\.com" || echo "0 — clean"
```
Expected: `0`. (Docs are excluded so this scan does not match its own pattern.)

- [ ] **Step 5: End-to-end pass, both themes**

As HR: open a SENT period → Payments. Confirm defaults, live Balance, save, persistence, and that a held-back category carries into the next period's opening balance (check the next period's Payments/paystub previous balance). Confirm the retired "Paid (Recon)" column is gone from the Input & Review grid and nothing references it.

- [ ] **Step 6: Push the branch**

```bash
git push -u origin feat/payroll-payments-step
```

Do **not** merge to `main` without review — `main` auto-deploys and this carries a migration.

---

## Notes for the implementer

- **Local `.env` points at production.** Every Prisma command and both data steps (Task 1 Step 6, Task 6) write to the live DB.
- **The three `ALTER INDEX ... RENAME` statements are not yours** — hand-write the migration (Task 1). Never run `npx prisma format`.
- **`npx next build`, not `npm run build`** — the npm script prefixes `prisma migrate deploy` and hits prod.
- **Retiring the "Paid (Recon)" column:** Task 3 stops the engine writing PAID; the `DEDUCTION_COLUMNS` entry `{ key: 'paid', label: 'Paid (Recon)', componentKey: 'PAID', editable: true }` in `PayrollEmployeeGrid.tsx` should be removed so HR no longer edits the dead field. Fold this into Task 5 (UI) and confirm no other consumer reads the `paid` grid column.
- **Balance semantics:** carried balance = previousBalance + Σ(computed − paid). Fully paid → previousBalance; a held category carries. A freshly calculated period (no payment rows) shows the full net owed. These agree at the fully-paid boundary, which is what the cross-period carry and the May/June backfill depend on.
- **If the deploy fails on `P1002`** (advisory lock), use Vercel → Redeploy (single build). Do not re-push repeatedly.
```
