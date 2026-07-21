# Payments Before Send + Skip-Unpaid — Design

**Status:** Approved
**Date:** 2026-07-22
**Extends:** `2026-07-21-payroll-payments-step-design.md` (the Payments step). This reorders it and adds send-filtering; the payment/balance model itself is unchanged.

## 1. Goal

Finalize payments **before** receipts are dispatched: move the Payments step ahead of Send, and have Send skip employees whose salary is being held (0 paid) so they don't receive a receipt. Support paying a held employee later and sending their receipt then.

## 2. Current state

The payroll wizard runs: Input & Review → Calculate → Reconciliation → Approve → **Send → Payments**. Send (`app/api/payroll/periods/[id]/send-docusign/route.ts`) requires `APPROVED`, dispatches every receipt whose status is `READY`/`FAILED` via DocuSign/HelloSign, and sets the period to `SENT` (or `PARTIAL` if some sends failed, `FAILED` if all did). Payments is editable only once the period is `SENT`.

The rolling balance is driven by `PayrollPayment` rows (per employee, per earning category): `balance = previousBalance + Σ(computed − paid)`. Marking an employee's amounts to 0 holds their salary and surfaces the amount as balance; entering the amounts later clears it.

## 3. What we are changing

### 3.1 Reorder the wizard

New order: Input & Review → Calculate → Reconciliation → Approve → **Payments → Send**. Payments becomes step 4, Send step 5. Approve the figures first, then finalize who is paid vs held, then dispatch receipts.

### 3.2 Payments editable before Send

Payments is editable when the period status is one of **APPROVED, SENDING, SENT, PARTIAL** — i.e. from Approve onward, including after a send so held salaries can be released later. It is **not** editable at DRAFT/CALCULATED (figures not signed off) or LOCKED (period closed). This applies to both the grid (client gate) and the `PUT /api/payroll/periods/[id]/payments` route (server gate), which must agree.

The per-category cells remain the inputs; **Paid** stays a live read-only total of them. "Editable before Send" is a consequence of the reorder, not a new editable column.

### 3.3 Send skips fully-unpaid employees

Send dispatches a receipt only to an employee whose **recorded paid total is greater than 0**. An employee held at 0 (status Pending) — or one whose payments were never recorded — is skipped and keeps their `READY` receipt untouched. Partially- and fully-paid employees both receive a receipt.

The eligibility rule is a pure function:

```
isSendable(receiptStatus, paidTotal) = (receiptStatus in {READY, FAILED}) AND paidTotal > 0
```

`paidTotal` per employee = Σ of their `PayrollPayment.paidAmount` for the period. The send route filters `period.receipts` through this rule before dispatching.

**Guard against un-finalized payments:** because an unrecorded employee has `paidTotal = 0`, they are skipped rather than sent blind. If **no** employee is sendable (nobody's payments recorded, or everyone held), Send returns a clear error: *"No paid employees to send. Record payments first, or every employee is held."* The Send step also shows a pre-send summary — **"N will be sent, M held (not sent)"** — so a forgotten finalize is visible before dispatching.

### 3.4 Re-running Send for held-then-paid employees

Send may now run from **APPROVED, SENT, or PARTIAL** (was APPROVED only). `SENDING` is a transient in-flight state and is deliberately excluded, so a re-run can't collide with a send already in progress. Send only ever dispatches receipts that are not already sent (`READY`/`FAILED`) and now pass the paid-total rule. So:

1. First Send (from APPROVED) dispatches the paid batch; held employees' receipts stay `READY`. Status → `SENT` (or `PARTIAL`/`FAILED` on send errors, unchanged).
2. Later, HR pays a held employee in Payments and saves; their `paidTotal` is now > 0 and their receipt is still `READY`.
3. HR clicks Send again (now allowed from `SENT`). Only that employee's receipt is dispatched.
4. An employee never paid keeps a `READY` receipt forever and simply never receives one — correct.

Status semantics are unchanged: a held (unsent) receipt is not a "failure", so a fully-successful send of the paid batch still yields `SENT`. Held receipts remaining `READY` is the signal that more can be sent later. Re-running Send with nothing newly payable returns the existing "no eligible receipts" response — a harmless no-op.

### 3.5 Receipts reflect payments

Because Payments now runs before Send, each dispatched receipt already carries its post-payment balance (`receiptJson.net.balance`, updated by the Payments save). A fully-paid employee's receipt shows balance 0; a partial shows the remainder. This is strictly better than today, where receipts went out before payment was known.

## 4. Hard constraints (project-wide)

- **No schema change, no migration.** `PayrollPayment` already exists; this is ordering + send logic only.
- **Public repo** `Data-Quant/compass` — no real names, salary figures, or policy content in source/tests/fixtures.
- **Local `.env` points at production Neon.** Every Prisma command hits prod.
- **`npm run lint` is broken repo-wide** — verify with `npx tsc --noEmit` and `npx next build`.
- **No test touches the DB.** The send-eligibility rule is a pure helper, unit-tested.

## 5. Testing

- Pure `isSendable(receiptStatus, paidTotal)` — unit tests: READY+paid → true; READY+0 → false; SENT+paid → false (already sent); FAILED+paid → true.
- Real-data check (script, restores after): a held (0-paid) employee is excluded from the sendable set; a paid one is included; re-running the set after "paying" the held one now includes them.
- The existing payroll suite (61 payroll tests) must keep passing.
- Browser walkthrough (needs an HR login + an APPROVED period): Approve → Payments (hold one employee at 0, save) → Send shows "N sent, 1 held" → send → held employee has no receipt → pay them in Payments → Send again → their receipt goes out.

## 6. Decisions log

| Decision | Choice |
|---|---|
| Step order | Approve → Payments → Send (Payments moved before Send) |
| Payments editable | APPROVED, SENDING, SENT, PARTIAL (not DRAFT/CALCULATED/LOCKED) |
| Paid column | Stays a read-only live total; per-category cells remain the inputs |
| Send skip rule | Skip employees with paid total 0 (held / Pending); Paid and Partial are sent |
| Un-finalized payments | Treated as 0 paid → skipped; Send errors if nobody is sendable; pre-send summary shown |
| Held → paid later | Re-run Send (allowed from APPROVED/SENT/PARTIAL, not transient SENDING); only not-yet-sent receipts dispatched |
| Status semantics | Unchanged; held receipts stay READY, period still reaches SENT |
| Net-vs-gross balance | Unchanged — held balance shows gross earnings, as today |

## 7. Out of scope

- Any change to the payment/balance math or the per-category model.
- Net-vs-gross balance representation.
- A new period status for "some held" (existing SENT + READY receipts already express it).
- Auto-sending a held employee's receipt on payment (HR re-runs Send explicitly).
