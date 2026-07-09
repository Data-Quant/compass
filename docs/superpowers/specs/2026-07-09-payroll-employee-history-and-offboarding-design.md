# Payroll — Employee History & Offboarding Visibility Design

**Date:** 2026-07-09
**Module:** Payroll (`PayrollEmployeeProfile`, `PayrollInputValue`, `PayrollComputedValue`, `PayrollReceipt`) + HR user admin

## Goal

Make offboarded employees and their payroll history first-class and safe:

1. **Stronger permanent-delete warning** so HR does not accidentally destroy an employee's payroll master data during offboarding.
2. An **Active / Offboarded filter** on the payroll dashboard's Employees tab so deactivated staff remain visible (they are currently filtered out entirely).
3. A **per-employee "Payroll history"** view (month-by-month category breakdown of what was actually paid), available for **both active and offboarded** employees — no such view exists today.

## Background (verified against current code)

- **Two removal paths exist.** HR "Deactivate" (`DELETE /api/admin/users`) is a soft delete: sets `PayrollEmployeeProfile.isPayrollActive = false` + `exitDate = now`, bumps `passwordVersion`, keeps the `User` row and all history; reversible via `reactivate`. "Permanently Delete" (`POST /api/admin/users/permanently-delete`) hard-deletes the `User`.
- **Permanent delete destroys master data.** `PayrollEmployeeProfile` cascades on user delete (`onDelete: Cascade`), taking bank details, CNIC, designation, and `PayrollSalaryRevision` history with it. `PayrollReceipt.userId` is `SetNull` (payslip kept, link nulled); `PayrollInputValue`/`PayrollComputedValue`/`PayrollExpenseEntry` `userId` are plain strings (no FK) so those rows survive with a stale/dangling `userId`. Net effect: past figures/payslips survive **only by name**; the employee master record is gone irreversibly.
- **Offboarded staff are hidden from payroll.** `isEligiblePayrollEmployee` (in `lib/payroll/employee-eligibility.ts`) returns `false` when `isPayrollActive === false`, so `GET /api/payroll/employees` omits them.
- **No per-employee history view exists.** Payroll is period-centric: the dashboard lists monthly `PayrollPeriod`s; a period shows its employee grid and per-period payslips (`GET /api/payroll/periods/[id]/receipts/[userId]`). `employees/[id]` exposes only `profile`. "Payroll History" in the run wizard is a back-link to the period list; "Approval History" is a single period's approval log; salary *revisions* are configured-salary changes, not actual monthly payouts.

## Resolved decisions

- **Placement:** payroll dashboard → Employees tab (`PayrollEmployeesPanel`), gated `canManagePayroll` (HR + O&A).
- **Audience for history:** both Active and Offboarded employees, same modal + endpoint.
- **Offboarding guidance:** Deactivate is the correct offboarding action; Permanently Delete is for genuine mistakes only. We add a clearer warning, **not** a hard block (per user choice).
- **No schema changes.** Everything is surfacing data that already exists.
- Permanently-deleted people (no `User` row) will not appear in these views — expected; this protects future offboarding.

## Feature designs

### 1 — Stronger permanent-delete warning
`app/(hr)/admin/users/page.tsx` permanent-delete modal copy is rewritten to state explicitly, before the type-to-confirm field:
- This **destroys** the payroll profile: bank details, CNIC, designation, joining/exit dates, and salary-revision history.
- Past period figures and payslips remain **only by employee name**, with the user link broken.
- The action is **irreversible**.
- **Recommended:** use **Deactivate** to offboard — it keeps all history and is reversible.

No logic change; the name-confirmation gate stays.

### 2 — Active / Offboarded filter on the Employees tab
**Eligibility split** (`lib/payroll/employee-eligibility.ts`): factor the structural exclusions (3E department, partner, noble) out of the active check.
- `isStructurallyPayrollEligible(user)` — everything except the `isPayrollActive` test.
- `isEligiblePayrollEmployee(user)` = `isStructurallyPayrollEligible(user) && user.payrollProfile?.isPayrollActive !== false` (unchanged behavior).
- `isOffboardedPayrollEmployee(user)` = `isStructurallyPayrollEligible(user) && user.payrollProfile?.isPayrollActive === false`.

**API** `GET /api/payroll/employees` gains `status=active|offboarded` (default `active`, preserving current behavior). `offboarded` returns structurally-eligible inactive employees using the O&A-safe `includeOperational` field set (name, designation, department, employment type, **exitDate**). Sensitive fields (`includePayrollDetails`) remain HR-only and independent of `status`.

**UI** `PayrollEmployeesPanel`: an `[Active] [Offboarded]` segmented toggle. Offboarded rows show designation, department, and **exit date**, plus a **"Payroll history"** action. (Active rows also get the "Payroll history" action — see feature 3.)

### 3 — Per-employee payroll history (month-by-month category breakdown)
**New API** `GET /api/payroll/employees/[id]/history` (`canManagePayroll`). For the target employee it resolves their identity (`userId`, with `payrollName` fallback for older rows that predate identity mapping) and returns, newest period first, an array of:
- `periodId`, `periodLabel`, `periodStart`, `periodStatus`
- `lineItems: Array<{ key, label, amount, kind: 'EARNING' | 'DEDUCTION' }>` — from that period's `PayrollInputValue` rows for the employee (Basic Salary, Mobile/Medical Allowance, Travel, Bonus, reimbursements, Income Tax, deductions…). `kind` is derived from the component key: `INCOME_TAX`, `ADVANCE_LOAN`, `LOAN_REPAYMENT`, and `ADJUSTMENT` (when negative) are `DEDUCTION`; everything else is `EARNING`. This classification lives in the component-label module so the pay stub and history share one source of truth.
- `totals: { totalEarnings, totalDeductions, netSalary }` — from `PayrollComputedValue` (`TOTAL_EARNINGS`, `TOTAL_DEDUCTIONS`, `NET_SALARY`)
- `receipt: { id, status } | null` — if a `PayrollReceipt` exists for that period/employee

A period is included when the employee has any `PayrollInputValue` or `PayrollComputedValue` rows there.

**Pure assembly helper** `buildEmployeePayrollHistory(...)` in `lib/payroll/employee-history.ts` takes raw input rows, computed rows, receipts, and period metadata and produces the sorted month array. Kept DB-free so it is unit-tested in isolation.

**Component labels:** map `componentKey → label` reusing `SYSTEM_SALARY_HEADS` (Basic Salary, Medical Allowance, Mobile Allowance) plus the `PayrollSalaryHead` table (`code → name`) and the pay-stub's existing labels; consolidate into `lib/payroll/component-labels.ts` and reuse in the pay stub if it isn't already centralized. Unknown keys fall back to a title-cased key.

**UI** `EmployeePayrollHistoryModal` (opened by "Payroll history" from either tab): fetches the history endpoint and renders one block per month — the category line items with amounts and a highlighted **Net Salary**. Where `receipt` is present, a **"View payslip"** button fetches the existing `GET /api/payroll/periods/[periodId]/receipts/[userId]` and shows the rendered receipt (`renderedHtml`). Empty state when the employee has no payroll history.

## Data flow

Deactivate → `User` + profile + receipts retained; employee leaves the Active list, appears under Offboarded with an exit date; full pay history stays viewable and is excluded from carry-forward (already shipped). Permanently Delete (now clearly warned) removes the `User` and cascades the profile; the person no longer appears in these views.

## Testing

- Unit tests (`node --import tsx --test`):
  - Eligibility split: active selection unchanged; offboarded selection returns inactive-but-structurally-eligible; 3E/partner/noble still excluded from both.
  - `buildEmployeePayrollHistory`: groups by period, maps labels, computes/echoes totals, sorts newest-first, attaches receipts, tolerant of missing computed rows.
- `npx tsc --noEmit` clean.
- Manual: Employees tab toggle, history modal for an active and an offboarded employee, "View payslip".

## Non-goals

- No schema changes; no new receipt generation or storage.
- No hard block on permanent delete (warning only).
- No bulk export / CSV of history (can follow later).
- No recovery of already permanently-deleted employees (e.g., Mudassir) — out of scope.

## Build order (phases)

1. Eligibility split + `status` param on the employees API (+ unit tests).
2. Active/Offboarded toggle in `PayrollEmployeesPanel`.
3. `buildEmployeePayrollHistory` helper + component-label map (+ unit tests).
4. `GET /api/payroll/employees/[id]/history` endpoint.
5. `EmployeePayrollHistoryModal` (breakdown + View payslip) wired to both tabs.
6. Stronger permanent-delete warning copy.
