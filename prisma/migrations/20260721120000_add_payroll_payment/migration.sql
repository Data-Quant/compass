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
CREATE INDEX "PayrollPayment_periodId_idx" ON "PayrollPayment"("periodId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPayment_periodId_payrollName_componentKey_key" ON "PayrollPayment"("periodId", "payrollName", "componentKey");

-- AddForeignKey
ALTER TABLE "PayrollPayment" ADD CONSTRAINT "PayrollPayment_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
