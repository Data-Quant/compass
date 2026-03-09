-- AlterEnum
ALTER TYPE "RelationshipType" ADD VALUE IF NOT EXISTS 'CROSS_DEPARTMENT';

-- CreateEnum
CREATE TYPE "PreEvaluationTriggerSource" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "PreEvaluationLeadStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'OVERRIDDEN');

-- CreateEnum
CREATE TYPE "PreEvaluationReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PreEvaluationEvaluateeType" AS ENUM ('PRIMARY', 'CROSS_DEPARTMENT');

-- AlterTable
ALTER TABLE "EvaluationPeriod"
ADD COLUMN "preEvaluationTriggeredAt" TIMESTAMP(3),
ADD COLUMN "preEvaluationTriggerSource" "PreEvaluationTriggerSource",
ADD COLUMN "preEvaluationTriggeredById" TEXT;

-- AlterTable
ALTER TABLE "Evaluation"
ALTER COLUMN "questionId" DROP NOT NULL,
ADD COLUMN "leadQuestionId" TEXT;

-- CreateTable
CREATE TABLE "PreEvaluationLeadPrep" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "status" "PreEvaluationLeadStatus" NOT NULL DEFAULT 'PENDING',
    "questionsSubmittedAt" TIMESTAMP(3),
    "evaluateesSubmittedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "overdueAt" TIMESTAMP(3),
    "overriddenAt" TIMESTAMP(3),
    "overriddenById" TEXT,
    "overrideNote" TEXT,
    "lastResetAt" TIMESTAMP(3),
    "resetById" TEXT,
    "resetNote" TEXT,
    "initialReminderSentAt" TIMESTAMP(3),
    "sevenDayReminderSentAt" TIMESTAMP(3),
    "oneDayReminderSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreEvaluationLeadPrep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreEvaluationLeadQuestion" (
    "id" TEXT NOT NULL,
    "prepId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "questionText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreEvaluationLeadQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreEvaluationEvaluateeSelection" (
    "id" TEXT NOT NULL,
    "prepId" TEXT NOT NULL,
    "type" "PreEvaluationEvaluateeType" NOT NULL,
    "evaluateeId" TEXT NOT NULL,
    "suggestedEvaluatorId" TEXT,
    "selectionKey" TEXT NOT NULL,
    "reviewStatus" "PreEvaluationReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreEvaluationEvaluateeSelection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EvaluationPeriod_startDate_idx" ON "EvaluationPeriod"("startDate");

-- CreateIndex
CREATE INDEX "EvaluationPeriod_preEvaluationTriggeredAt_idx" ON "EvaluationPeriod"("preEvaluationTriggeredAt");

-- CreateIndex
CREATE INDEX "Evaluation_leadQuestionId_idx" ON "Evaluation"("leadQuestionId");

-- CreateIndex
CREATE UNIQUE INDEX "Evaluation_evaluatorId_evaluateeId_leadQuestionId_periodId_key" ON "Evaluation"("evaluatorId", "evaluateeId", "leadQuestionId", "periodId");

-- CreateIndex
CREATE UNIQUE INDEX "PreEvaluationLeadPrep_periodId_leadId_key" ON "PreEvaluationLeadPrep"("periodId", "leadId");

-- CreateIndex
CREATE INDEX "PreEvaluationLeadPrep_leadId_idx" ON "PreEvaluationLeadPrep"("leadId");

-- CreateIndex
CREATE INDEX "PreEvaluationLeadPrep_periodId_idx" ON "PreEvaluationLeadPrep"("periodId");

-- CreateIndex
CREATE INDEX "PreEvaluationLeadPrep_status_idx" ON "PreEvaluationLeadPrep"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PreEvaluationLeadQuestion_prepId_orderIndex_key" ON "PreEvaluationLeadQuestion"("prepId", "orderIndex");

-- CreateIndex
CREATE INDEX "PreEvaluationLeadQuestion_prepId_idx" ON "PreEvaluationLeadQuestion"("prepId");

-- CreateIndex
CREATE UNIQUE INDEX "PreEvaluationEvaluateeSelection_prepId_selectionKey_key" ON "PreEvaluationEvaluateeSelection"("prepId", "selectionKey");

-- CreateIndex
CREATE INDEX "PreEvaluationEvaluateeSelection_prepId_idx" ON "PreEvaluationEvaluateeSelection"("prepId");

-- CreateIndex
CREATE INDEX "PreEvaluationEvaluateeSelection_evaluateeId_idx" ON "PreEvaluationEvaluateeSelection"("evaluateeId");

-- CreateIndex
CREATE INDEX "PreEvaluationEvaluateeSelection_suggestedEvaluatorId_idx" ON "PreEvaluationEvaluateeSelection"("suggestedEvaluatorId");

-- CreateIndex
CREATE INDEX "PreEvaluationEvaluateeSelection_reviewStatus_idx" ON "PreEvaluationEvaluateeSelection"("reviewStatus");

-- AddForeignKey
ALTER TABLE "EvaluationPeriod" ADD CONSTRAINT "EvaluationPeriod_preEvaluationTriggeredById_fkey" FOREIGN KEY ("preEvaluationTriggeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_leadQuestionId_fkey" FOREIGN KEY ("leadQuestionId") REFERENCES "PreEvaluationLeadQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreEvaluationLeadPrep" ADD CONSTRAINT "PreEvaluationLeadPrep_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "EvaluationPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreEvaluationLeadPrep" ADD CONSTRAINT "PreEvaluationLeadPrep_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreEvaluationLeadPrep" ADD CONSTRAINT "PreEvaluationLeadPrep_overriddenById_fkey" FOREIGN KEY ("overriddenById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreEvaluationLeadPrep" ADD CONSTRAINT "PreEvaluationLeadPrep_resetById_fkey" FOREIGN KEY ("resetById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreEvaluationLeadQuestion" ADD CONSTRAINT "PreEvaluationLeadQuestion_prepId_fkey" FOREIGN KEY ("prepId") REFERENCES "PreEvaluationLeadPrep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreEvaluationEvaluateeSelection" ADD CONSTRAINT "PreEvaluationEvaluateeSelection_prepId_fkey" FOREIGN KEY ("prepId") REFERENCES "PreEvaluationLeadPrep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreEvaluationEvaluateeSelection" ADD CONSTRAINT "PreEvaluationEvaluateeSelection_evaluateeId_fkey" FOREIGN KEY ("evaluateeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreEvaluationEvaluateeSelection" ADD CONSTRAINT "PreEvaluationEvaluateeSelection_suggestedEvaluatorId_fkey" FOREIGN KEY ("suggestedEvaluatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreEvaluationEvaluateeSelection" ADD CONSTRAINT "PreEvaluationEvaluateeSelection_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
