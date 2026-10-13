-- CreateEnum
CREATE TYPE "SecurityCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "SecuritySubtaskMode" AS ENUM ('NONE', 'ADMIN_DEFINED', 'EMPLOYEE_DEFINED', 'ADMIN_WITH_EMPLOYEE_ADDITIONS');

-- CreateEnum
CREATE TYPE "SecurityFrequency" AS ENUM ('ONE_TIME', 'QUARTERLY', 'EVERY_4_MONTHS', 'EVERY_6_MONTHS', 'ANNUALLY');

-- CreateEnum
CREATE TYPE "SecurityRecurrenceAnchor" AS ENUM ('FIXED_CALENDAR', 'RELATIVE_TO_CLOSE');

-- CreateEnum
CREATE TYPE "SecurityQuestionType" AS ENUM ('YES_NO', 'ACCOUNT_IDENTIFIER', 'SHORT_TEXT');

-- CreateEnum
CREATE TYPE "SecurityCycleStatus" AS ENUM ('OPEN', 'CLOSING', 'CLOSED');

-- CreateEnum
CREATE TYPE "SecurityTaskStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'PENDING_REVIEW', 'REQUIRES_INFO', 'REJECTED', 'VERIFIED', 'EXPIRED', 'NOT_APPLICABLE', 'CANCELLED', 'EXEMPT');

-- CreateEnum
CREATE TYPE "SecurityExpiryReason" AS ENUM ('NO_SUBMISSION', 'WINDOW_LAPSED', 'REJECTED_POST_CLOSE', 'UNREVIEWED');

-- CreateEnum
CREATE TYPE "SecuritySubtaskSource" AS ENUM ('TASK', 'ADMIN', 'EMPLOYEE', 'DECLARATION');

-- CreateEnum
CREATE TYPE "SecuritySubtaskStatus" AS ENUM ('OPEN', 'PENDING_REVIEW', 'REQUIRES_INFO', 'REJECTED', 'VERIFIED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "SecurityReviewActionType" AS ENUM ('VERIFY', 'REJECT', 'REQUEST_INFO', 'APPROVE_NA', 'DENY_NA', 'REOPEN', 'TASK_NA');

-- CreateTable
CREATE TABLE "SecurityCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "control" TEXT NOT NULL,
    "instructions" TEXT NOT NULL DEFAULT '',
    "instructionImages" JSONB NOT NULL DEFAULT '[]',
    "videoUrl" TEXT,
    "subtaskMode" "SecuritySubtaskMode" NOT NULL DEFAULT 'NONE',
    "evidenceRequired" BOOLEAN NOT NULL DEFAULT true,
    "fileLimit" INTEGER NOT NULL DEFAULT 3,
    "deadlineDays" INTEGER NOT NULL,
    "reminderOffsets" INTEGER[] DEFAULT ARRAY[14, 7, 1]::INTEGER[],
    "frequency" "SecurityFrequency" NOT NULL,
    "recurrenceAnchor" "SecurityRecurrenceAnchor" NOT NULL DEFAULT 'FIXED_CALENDAR',
    "audience" JSONB NOT NULL,
    "status" "SecurityCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "firstOpenAt" TIMESTAMP(3),
    "launchedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "lineageId" TEXT NOT NULL,
    "predecessorId" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityCampaignQuestion" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "type" "SecurityQuestionType" NOT NULL,
    "prompt" TEXT NOT NULL,
    "compliantAnswer" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityCampaignQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityCampaignSubtask" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityCampaignSubtask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityCycle" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "openAt" TIMESTAMP(3) NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "scheduledCloseAt" TIMESTAMP(3) NOT NULL,
    "actualCloseAt" TIMESTAMP(3),
    "status" "SecurityCycleStatus" NOT NULL DEFAULT 'OPEN',
    "earlyClosedById" TEXT,
    "earlyCloseReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityTask" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "SecurityTaskStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "deadline" TIMESTAMP(3) NOT NULL,
    "originalDeadline" TIMESTAMP(3) NOT NULL,
    "lateEnrollment" BOOLEAN NOT NULL DEFAULT false,
    "extendedById" TEXT,
    "extendedAt" TIMESTAMP(3),
    "extensionReason" TEXT,
    "exemptedById" TEXT,
    "exemptedAt" TIMESTAMP(3),
    "exemptionReason" TEXT,
    "naGrantedById" TEXT,
    "naReason" TEXT,
    "cancelReason" TEXT,
    "expiryReason" "SecurityExpiryReason",
    "expiredAt" TIMESTAMP(3),
    "unreviewedFlag" BOOLEAN NOT NULL DEFAULT false,
    "firstSubmittedAt" TIMESTAMP(3),
    "lastSubmittedAt" TIMESTAMP(3),
    "lastVerdictAt" TIMESTAMP(3),
    "resubmitDueAt" TIMESTAMP(3),
    "finalRoundAt" TIMESTAMP(3),
    "subtasksLockedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecuritySubtask" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "source" "SecuritySubtaskSource" NOT NULL,
    "templateId" TEXT,
    "status" "SecuritySubtaskStatus" NOT NULL DEFAULT 'OPEN',
    "answers" JSONB NOT NULL DEFAULT '{}',
    "declarationConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "naRequested" BOOLEAN NOT NULL DEFAULT false,
    "naJustification" TEXT,
    "naApprovedById" TEXT,
    "lastVerdict" "SecurityReviewActionType",
    "lastVerdictReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecuritySubtask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecuritySubmission" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "submittedById" TEXT NOT NULL,
    "confirmed" BOOLEAN NOT NULL,
    "isFinal" BOOLEAN NOT NULL DEFAULT false,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecuritySubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityEvidenceFile" (
    "id" TEXT NOT NULL,
    "subtaskId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "submissionId" TEXT,
    "storagePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityEvidenceFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityReviewAction" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "subtaskId" TEXT,
    "submissionId" TEXT,
    "action" "SecurityReviewActionType" NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "reason" TEXT,
    "selfReview" BOOLEAN NOT NULL DEFAULT false,
    "selfReviewJustification" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityReviewAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityConsoleGrant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "grantedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityConsoleGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityAuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "campaignId" TEXT,
    "cycleId" TEXT,
    "taskId" TEXT,
    "selfReview" BOOLEAN NOT NULL DEFAULT false,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "taskId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "emailed" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecuritySettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "retentionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "evidenceRetentionMonths" INTEGER NOT NULL DEFAULT 12,
    "attestationRetentionMonths" INTEGER NOT NULL DEFAULT 36,
    "auditRetentionMonths" INTEGER NOT NULL DEFAULT 36,
    "retentionFirstRunAt" TIMESTAMP(3),
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecuritySettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SecurityCampaign_status_idx" ON "SecurityCampaign"("status");

-- CreateIndex
CREATE INDEX "SecurityCampaign_lineageId_idx" ON "SecurityCampaign"("lineageId");

-- CreateIndex
CREATE INDEX "SecurityCampaignQuestion_campaignId_position_idx" ON "SecurityCampaignQuestion"("campaignId", "position");

-- CreateIndex
CREATE INDEX "SecurityCampaignSubtask_campaignId_position_idx" ON "SecurityCampaignSubtask"("campaignId", "position");

-- CreateIndex
CREATE INDEX "SecurityCycle_status_idx" ON "SecurityCycle"("status");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityCycle_campaignId_number_key" ON "SecurityCycle"("campaignId", "number");

-- CreateIndex
CREATE INDEX "SecurityTask_userId_status_idx" ON "SecurityTask"("userId", "status");

-- CreateIndex
CREATE INDEX "SecurityTask_campaignId_status_idx" ON "SecurityTask"("campaignId", "status");

-- CreateIndex
CREATE INDEX "SecurityTask_status_deadline_idx" ON "SecurityTask"("status", "deadline");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityTask_cycleId_userId_key" ON "SecurityTask"("cycleId", "userId");

-- CreateIndex
CREATE INDEX "SecuritySubtask_taskId_position_idx" ON "SecuritySubtask"("taskId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "SecuritySubmission_taskId_round_key" ON "SecuritySubmission"("taskId", "round");

-- CreateIndex
CREATE INDEX "SecurityEvidenceFile_subtaskId_idx" ON "SecurityEvidenceFile"("subtaskId");

-- CreateIndex
CREATE INDEX "SecurityEvidenceFile_taskId_idx" ON "SecurityEvidenceFile"("taskId");

-- CreateIndex
CREATE INDEX "SecurityReviewAction_taskId_createdAt_idx" ON "SecurityReviewAction"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityReviewAction_reviewerId_createdAt_idx" ON "SecurityReviewAction"("reviewerId", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityReviewAction_selfReview_createdAt_idx" ON "SecurityReviewAction"("selfReview", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityConsoleGrant_userId_key" ON "SecurityConsoleGrant"("userId");

-- CreateIndex
CREATE INDEX "SecurityAuditLog_createdAt_idx" ON "SecurityAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "SecurityAuditLog_campaignId_createdAt_idx" ON "SecurityAuditLog"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityAuditLog_taskId_createdAt_idx" ON "SecurityAuditLog"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityAuditLog_action_createdAt_idx" ON "SecurityAuditLog"("action", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityNotification_dedupeKey_key" ON "SecurityNotification"("dedupeKey");

-- CreateIndex
CREATE INDEX "SecurityNotification_userId_readAt_idx" ON "SecurityNotification"("userId", "readAt");

-- AddForeignKey
ALTER TABLE "SecurityCampaignQuestion" ADD CONSTRAINT "SecurityCampaignQuestion_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SecurityCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityCampaignSubtask" ADD CONSTRAINT "SecurityCampaignSubtask_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SecurityCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityCycle" ADD CONSTRAINT "SecurityCycle_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "SecurityCampaign"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityTask" ADD CONSTRAINT "SecurityTask_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "SecurityCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecuritySubtask" ADD CONSTRAINT "SecuritySubtask_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "SecurityTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecuritySubmission" ADD CONSTRAINT "SecuritySubmission_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "SecurityTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityEvidenceFile" ADD CONSTRAINT "SecurityEvidenceFile_subtaskId_fkey" FOREIGN KEY ("subtaskId") REFERENCES "SecuritySubtask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityReviewAction" ADD CONSTRAINT "SecurityReviewAction_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "SecurityTask"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

