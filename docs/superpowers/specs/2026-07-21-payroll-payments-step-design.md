# Payroll Payments Step — Design

**Status:** Approved
**Date:** 2026-07-21
**Supersedes:** the Auto-Paid behaviour shipped 2026-07-20 (`FIX_PAID_DEFAULTS_NET_V1`). That fix silently assumed every net salary was paid so the rolling balance would stop compounding. The team wants that assumption replaced by an explicit, per-category manual record of what was actually disbursed.

## 1. Goal

Give HR a **Payments** step, after Send, where they record what was actually paid to each employee — per earning category, in amounts — so the rolling balance reflects real disbursements instead of an automatic assumption. Remove the Auto-Paid system that currently fills this in.

## 2. Current state

The payroll wizard has five steps: **Input & Review → Calculate → Reconciliation → Approve → Send**. "Send" generates PDF payslips and dispatches them via HelloSign for e-signature, moving the period `APPROVED → SENDING → SENT`. It is document delivery, not money movement.

The rolling balance is computed by the engine (`lib/payroll/engine.ts`): `balance = previousBalance + netSalary − paid`. Today `paid` is auto-defaulted to `netSalary` by `resolvePaidForBalance` (`AUTO_PAID_NET`), so balances reconcile to zero automatically. The single `PAID` input ("Paid (Recon)" column in the grid) is the only payment signal.

## 3. What we are building

### 3.1 The Payments step (6th wizard step, after Send)

Reuses the existing employee-grid table structure (`PayrollEmployeeGrid`). Rows are employees. Columns:

- **Earning categories, editable, per-category paid amount** — Basic Salary, Medical, Bonus, Travel, Mobile, Reimbursements, Advance Loan. Each cell **defaults to that category's computed amount** and can be adjusted down (or to any value ≤ computed). These are the payable line items.
- **Paid** (derived, read-only) — the total recorded as disbursed for that employee.
- **Balance / Pending** (derived, read-only) — what is still owed.
- **Status chip** (derived) — **Paid** (balance 0), **Partial** (some but not all), **Pending** (nothing recorded).

Deductions (Income Tax, Adjustment, Loan Repayment) are **not** payable categories — they are withheld, not disbursed — so they have no paid-column. They still reduce net as computed.

The step is available once the period is **SENT**. Editable by **HR + O&A** (`canManagePayroll`). "Default = computed" is a UI starting point the user reviews and saves; it is not applied automatically by the engine (that is the whole point of removing Auto-Paid).

### 3.2 The balance, driven by payment marks

Per employee, per period:

```
Balance = previousBalance + Σ over earning categories (computed − paid)
```

- Every category left at its computed default → `Σ(computed − paid) = 0` → Balance = previousBalance (0 when the prior period was fully paid).
- Travel of 5,000 left unpaid → Balance = previousBalance + 5,000, and that 5,000 carries into next month's opening balance.

This is algebraically the current `previousBalance + net − paid` expressed category-wise, which sidesteps the gross/net confusion: deductions never appear as a payable amount and cancel cleanly. Only earning categories are payable and carryable.

**Timing.** A freshly calculated period has no payment records yet, so it shows the **full net as owed** — correct, since nobody has been paid at Approve/Send time. The Payments step draws the balance down as HR records disbursements. The next period's opening balance reads the prior period's post-payments balance, exactly as the engine does today.

### 3.3 Removing Auto-Paid

- Delete `resolvePaidForBalance` and the `AUTO_PAID_NET` auto-fill from `lib/payroll/engine.ts`, and drop `FIX_PAID_DEFAULTS_NET` from the lineage.
- The engine no longer auto-fills a `PAID` input. The balance calc reads payment records (§3.4) for the period being calculated; when none exist, `paid = 0` and the balance is the full owed amount.
- Retire the single `PAID` input component and the "Paid (Recon)" grid column — superseded by the per-category Payments step. Keep the `PAID` enum value for backward compatibility with historical rows; stop writing it.
- The `reconcileNetVsPaid` mismatch check is **removed** — with `PAID` retired it has no input. The Reconciliation step keeps its other checks. Payment shortfalls are surfaced by the Balance column in the Payments step, not by a reconciliation mismatch.

### 3.4 Data model

New table `PayrollPayment`, one row per (period, employee, category), mirroring `PayrollInputValue`:

```
PayrollPayment {
  id           String
  periodId     String        // FK -> PayrollPeriod, onDelete: Cascade
  payrollName  String
  userId       String?
  componentKey String        // an earning category, e.g. BASIC_SALARY
  paidAmount   Float
  createdAt    DateTime
  updatedAt    DateTime
  @@unique([periodId, payrollName, componentKey])
  @@index([periodId])
}
```

Saving payment marks:
- Upserts the `PayrollPayment` rows for the edited employee(s).
- Recomputes that employee's `BALANCE` (`PayrollComputedValue`) and the `net.balance` in their `PayrollReceipt` via a **targeted update** — no full engine recalc (which is blocked post-approval anyway).
- Does not change any earning/deduction/net figure — payments only affect the balance.

### 3.5 Existing May/June data

Both periods are currently zero-balance via Auto-Paid. Migration seeds `PayrollPayment` at the **full computed amount** for every earning category of every employee in the SENT/approved periods, so balances stay 0 through the switch — no regression, no visible change to already-sent months. The `AUTO_PAID_NET` input rows are then removed.

## 4. Hard constraints (project-wide)

- **Additive-first.** New table + columns only; no existing table altered destructively. One additive migration.
- **Public repo.** `Data-Quant/compass` is public — no real names, salary figures, or policy content in source, tests, or fixtures. Tests use invented data.
- **Prod DB.** Local `.env` points at production Neon; every Prisma command hits prod. The migration auto-applies on Vercel build.
- **`npm run lint` is broken repo-wide** — verify with `npx tsc --noEmit` and `npx next build`.
- **Pure functions are unit-tested** (`node --test` + `tsx`); no test touches the DB. The balance/payment math must be extracted as a pure, testable helper.

## 5. Testing

- Pure helper `computePaymentBalance(categories, previousBalance)` → balance and status, unit-tested: all-paid → previousBalance; a held category → carries; partial → Partial status; nothing → full owed.
- Existing 57 payroll tests must keep passing (minus the retired `resolvePaidForBalance` tests, which are replaced).
- Browser verification: run a period through to Send, open Payments, confirm defaults, adjust a category, confirm balance carries into the next period.

## 6. Decisions log

| Decision | Choice |
|---|---|
| What "Paid" does to the balance | Paid reconciles; Pending carries into next month |
| Granularity | Amount + category based; each cell defaults to the computed total, adjustable |
| Placement | 6th wizard step, after Send |
| Lifecycle when all paid | Nothing automatic — Payments is a living tracking view; period stays SENT |
| Access | HR + O&A (`canManagePayroll`), editable once SENT |
| Deductions | Not payable categories; withheld as computed, no paid-column |
| Auto-Paid | Removed entirely; replaced by explicit per-category marks |
| Existing May/June | Seeded full-paid so balances stay 0 across the switch |

## 7. Out of scope

- Auto-locking or a new terminal "Paid" period status.
- Partial-payment scheduling, payment dates/methods, or bank integration (only amount-per-category is recorded).
- Recomputing deductions/tax based on partial disbursement.
- Any change to Send, HelloSign, or the earlier wizard steps beyond removing the retired PAID column.
