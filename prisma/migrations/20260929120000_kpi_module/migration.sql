-- CreateEnum
CREATE TYPE "KpiScope" AS ENUM ('TEAM', 'DEPARTMENT');

-- CreateEnum
CREATE TYPE "KpiEvidenceType" AS ENUM ('LINK', 'DOCUMENT', 'NUMBER', 'CLIENT_CONFIRMATION');

-- CreateEnum
CREATE TYPE "KpiStatus" AS ENUM ('DRAFT', 'LOCKED', 'CLAIMED_DONE', 'NOT_DONE', 'NEEDS_INFO', 'REJECTED', 'APPEALED', 'VERIFIED', 'NOT_VERIFIED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "KpiGrantRole" AS ENUM ('VERIFIER', 'DEPARTMENT_SETTER');

-- CreateEnum
CREATE TYPE "KpiChangeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "KpiMonth" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "goalsLockAt" TIMESTAMP(3) NOT NULL,
    "claimsDueAt" TIMESTAMP(3) NOT NULL,
    "verifyDueAt" TIMESTAMP(3) NOT NULL,
    "responseDueAt" TIMESTAMP(3) NOT NULL,
    "targetFinalAt" TIMESTAMP(3) NOT NULL,
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KpiMonth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiGoal" (
    "id" TEXT NOT NULL,
    "kpiMonthId" TEXT NOT NULL,
    "scope" "KpiScope" NOT NULL,
    "departmentKey" TEXT,
    "setterId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KpiGoal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kpi" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "evidenceType" "KpiEvidenceType" NOT NULL,
    "status" "KpiStatus" NOT NULL DEFAULT 'DRAFT',
    "lockedSnapshot" JSONB,
    "claimedById" TEXT,
    "claimedAt" TIMESTAMP(3),
    "claimNote" TEXT,
    "claimUrl" TEXT,
    "reportedValue" TEXT,
    "appealUsedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Kpi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiAssignee" (
    "kpiId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "KpiAssignee_pkey" PRIMARY KEY ("kpiId","userId")
);

-- CreateTable
CREATE TABLE "KpiEvidenceFile" (
    "id" TEXT NOT NULL,
    "kpiId" TEXT NOT NULL,
    "blobPath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KpiEvidenceFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiChangeRequest" (
    "id" TEXT NOT NULL,
    "kpiId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "proposed" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "KpiChangeStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KpiChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiSetterAssignment" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "setterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KpiSetterAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiRoleGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "KpiGrantRole" NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KpiRoleGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiEvent" (
    "id" TEXT NOT NULL,
    "kpiId" TEXT,
    "kpiMonthId" TEXT,
    "actorId" TEXT,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KpiEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KpiNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KpiNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KpiMonth_year_month_key" ON "KpiMonth"("year", "month");

-- CreateIndex
CREATE INDEX "KpiGoal_kpiMonthId_scope_setterId_idx" ON "KpiGoal"("kpiMonthId", "scope", "setterId");

-- CreateIndex
CREATE INDEX "KpiGoal_kpiMonthId_departmentKey_idx" ON "KpiGoal"("kpiMonthId", "departmentKey");

-- CreateIndex
CREATE INDEX "Kpi_goalId_idx" ON "Kpi"("goalId");

-- CreateIndex
CREATE INDEX "Kpi_status_idx" ON "Kpi"("status");

-- CreateIndex
CREATE INDEX "KpiAssignee_userId_idx" ON "KpiAssignee"("userId");

-- CreateIndex
CREATE INDEX "KpiEvidenceFile_kpiId_idx" ON "KpiEvidenceFile"("kpiId");

-- CreateIndex
CREATE INDEX "KpiChangeRequest_kpiId_status_idx" ON "KpiChangeRequest"("kpiId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "KpiSetterAssignment_employeeId_setterId_key" ON "KpiSetterAssignment"("employeeId", "setterId");

-- CreateIndex
CREATE UNIQUE INDEX "KpiRoleGrant_userId_role_key" ON "KpiRoleGrant"("userId", "role");

-- CreateIndex
CREATE INDEX "KpiEvent_kpiId_createdAt_idx" ON "KpiEvent"("kpiId", "createdAt");

-- CreateIndex
CREATE INDEX "KpiEvent_kpiMonthId_createdAt_idx" ON "KpiEvent"("kpiMonthId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "KpiNotification_dedupeKey_key" ON "KpiNotification"("dedupeKey");

-- AddForeignKey
ALTER TABLE "KpiGoal" ADD CONSTRAINT "KpiGoal_kpiMonthId_fkey" FOREIGN KEY ("kpiMonthId") REFERENCES "KpiMonth"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kpi" ADD CONSTRAINT "Kpi_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "KpiGoal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiAssignee" ADD CONSTRAINT "KpiAssignee_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "Kpi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiEvidenceFile" ADD CONSTRAINT "KpiEvidenceFile_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "Kpi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KpiChangeRequest" ADD CONSTRAINT "KpiChangeRequest_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "Kpi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
