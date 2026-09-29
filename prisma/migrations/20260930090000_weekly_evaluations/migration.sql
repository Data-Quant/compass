-- CreateEnum
CREATE TYPE "WeeklyPerspective" AS ENUM ('LEAD', 'UPWARD', 'PEER');

-- CreateEnum
CREATE TYPE "WeeklyCycleStatus" AS ENUM ('SETUP', 'RUNNING', 'CLOSED');

-- CreateEnum
CREATE TYPE "WeeklyProfileStatus" AS ENUM ('DRAFT', 'APPROVED', 'RETIRED');

-- CreateEnum
CREATE TYPE "WeeklySlotStatus" AS ENUM ('OPEN', 'SATISFIED', 'CLOSED_NOT_OBSERVED', 'CLOSED_INSUFFICIENT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WeeklyPromptKind" AS ENUM ('STANDARD', 'FOLLOW_UP', 'COMMENT');

-- CreateEnum
CREATE TYPE "WeeklyPromptStatus" AS ENUM ('OPEN', 'DRAFT', 'SUBMITTED', 'NOT_OBSERVED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WeeklyReviewAction" AS ENUM ('ACCEPTED', 'ADJUSTED', 'MARKED_INSUFFICIENT', 'EXCLUDED', 'AUTO_ACCEPTED', 'MANUAL');

-- CreateEnum
CREATE TYPE "WeeklyChallengeStatus" AS ENUM ('OPEN', 'UPHELD', 'NOT_UPHELD');

-- AlterTable
ALTER TABLE "Evaluation" ADD COLUMN     "aggregationRunId" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'MANUAL';

-- CreateTable
CREATE TABLE "WeeklyCycle" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "weekOneStartsOn" TIMESTAMP(3) NOT NULL,
    "weeklyCap" INTEGER NOT NULL DEFAULT 5,
    "status" "WeeklyCycleStatus" NOT NULL DEFAULT 'SETUP',
    "simulatedWeek" INTEGER,
    "formsOpenAt" TIMESTAMP(3),
    "resultsPublishedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyCompetency" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "perspective" "WeeklyPerspective" NOT NULL,
    "name" TEXT NOT NULL,
    "definition" TEXT NOT NULL,
    "sourceQuestionId" TEXT,
    "sourceLeadQuestionId" TEXT,
    "leadId" TEXT,
    "cycleId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyCompetency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyCompetencyPrompt" (
    "id" TEXT NOT NULL,
    "competencyId" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyCompetencyPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyProfile" (
    "id" TEXT NOT NULL,
    "competencyId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "levels" JSONB NOT NULL,
    "insufficientDefinition" TEXT NOT NULL,
    "status" "WeeklyProfileStatus" NOT NULL DEFAULT 'DRAFT',
    "incomplete" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklySlot" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "evaluatorId" TEXT NOT NULL,
    "evaluateeId" TEXT NOT NULL,
    "relationshipType" "RelationshipType" NOT NULL,
    "competencyId" TEXT NOT NULL,
    "status" "WeeklySlotStatus" NOT NULL DEFAULT 'OPEN',
    "notObservedCount" INTEGER NOT NULL DEFAULT 0,
    "followUpCount" INTEGER NOT NULL DEFAULT 0,
    "snoozedUntilWeek" INTEGER,
    "lastAskedWeek" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklySlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyPrompt" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "slotId" TEXT,
    "evaluatorId" TEXT NOT NULL,
    "evaluateeId" TEXT NOT NULL,
    "relationshipType" "RelationshipType" NOT NULL,
    "weekIndex" INTEGER NOT NULL,
    "kind" "WeeklyPromptKind" NOT NULL DEFAULT 'STANDARD',
    "promptVariantId" TEXT,
    "questionId" TEXT,
    "textSnapshot" TEXT NOT NULL,
    "status" "WeeklyPromptStatus" NOT NULL DEFAULT 'OPEN',
    "releasedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyPrompt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyRelease" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "weekIndex" INTEGER NOT NULL,
    "evaluatorId" TEXT NOT NULL,
    "promptCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyResponse" (
    "id" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "situation" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL DEFAULT '',
    "result" TEXT NOT NULL DEFAULT '',
    "shortfall" TEXT,
    "commentText" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyScoringJob" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "leaseToken" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyScoringJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyAiScore" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "profileId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "sufficiency" TEXT NOT NULL,
    "score" INTEGER,
    "confidence" TEXT NOT NULL,
    "criteriaMet" JSONB NOT NULL,
    "criteriaNotDemonstrated" JSONB NOT NULL,
    "evidenceQuotes" JSONB NOT NULL,
    "rationale" TEXT NOT NULL,
    "followUpPrompt" TEXT,
    "flags" JSONB NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyAiScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyScoreReview" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "aiScoreId" TEXT,
    "action" "WeeklyReviewAction" NOT NULL,
    "finalScore" DOUBLE PRECISION,
    "reason" TEXT,
    "reviewerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyScoreReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyAggregationRun" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "runById" TEXT NOT NULL,
    "counts" JSONB NOT NULL,
    "drops" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyAggregationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyChallenge" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "evaluateeId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "WeeklyChallengeStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyParticipantOverride" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "optIn" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyParticipantOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "delivered" BOOLEAN NOT NULL DEFAULT true,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyAuditEvent" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT,
    "actorId" TEXT,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyCycle_periodId_key" ON "WeeklyCycle"("periodId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyCompetency_key_key" ON "WeeklyCompetency"("key");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyCompetency_sourceLeadQuestionId_key" ON "WeeklyCompetency"("sourceLeadQuestionId");

-- CreateIndex
CREATE INDEX "WeeklyCompetency_perspective_isActive_idx" ON "WeeklyCompetency"("perspective", "isActive");

-- CreateIndex
CREATE INDEX "WeeklyCompetency_sourceQuestionId_idx" ON "WeeklyCompetency"("sourceQuestionId");

-- CreateIndex
CREATE INDEX "WeeklyCompetency_cycleId_leadId_idx" ON "WeeklyCompetency"("cycleId", "leadId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyCompetencyPrompt_competencyId_variant_key" ON "WeeklyCompetencyPrompt"("competencyId", "variant");

-- CreateIndex
CREATE INDEX "WeeklyProfile_competencyId_status_idx" ON "WeeklyProfile"("competencyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyProfile_competencyId_version_key" ON "WeeklyProfile"("competencyId", "version");

-- CreateIndex
CREATE INDEX "WeeklySlot_cycleId_evaluatorId_status_idx" ON "WeeklySlot"("cycleId", "evaluatorId", "status");

-- CreateIndex
CREATE INDEX "WeeklySlot_cycleId_evaluateeId_idx" ON "WeeklySlot"("cycleId", "evaluateeId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklySlot_cycleId_evaluatorId_evaluateeId_relationshipType_key" ON "WeeklySlot"("cycleId", "evaluatorId", "evaluateeId", "relationshipType", "competencyId");

-- CreateIndex
CREATE INDEX "WeeklyPrompt_cycleId_evaluatorId_status_idx" ON "WeeklyPrompt"("cycleId", "evaluatorId", "status");

-- CreateIndex
CREATE INDEX "WeeklyPrompt_slotId_weekIndex_idx" ON "WeeklyPrompt"("slotId", "weekIndex");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyPrompt_cycleId_evaluatorId_evaluateeId_relationshipTy_key" ON "WeeklyPrompt"("cycleId", "evaluatorId", "evaluateeId", "relationshipType", "questionId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyRelease_cycleId_weekIndex_evaluatorId_key" ON "WeeklyRelease"("cycleId", "weekIndex", "evaluatorId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyResponse_promptId_key" ON "WeeklyResponse"("promptId");

-- CreateIndex
CREATE INDEX "WeeklyScoringJob_status_runAfter_idx" ON "WeeklyScoringJob"("status", "runAfter");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyScoringJob_responseId_revision_key" ON "WeeklyScoringJob"("responseId", "revision");

-- CreateIndex
CREATE INDEX "WeeklyAiScore_responseId_idx" ON "WeeklyAiScore"("responseId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyAiScore_responseId_revision_profileId_model_promptVer_key" ON "WeeklyAiScore"("responseId", "revision", "profileId", "model", "promptVersion");

-- CreateIndex
CREATE INDEX "WeeklyScoreReview_responseId_createdAt_idx" ON "WeeklyScoreReview"("responseId", "createdAt");

-- CreateIndex
CREATE INDEX "WeeklyAggregationRun_cycleId_createdAt_idx" ON "WeeklyAggregationRun"("cycleId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyChallenge_cycleId_evaluateeId_key" ON "WeeklyChallenge"("cycleId", "evaluateeId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyParticipantOverride_cycleId_userId_key" ON "WeeklyParticipantOverride"("cycleId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyNotification_dedupeKey_key" ON "WeeklyNotification"("dedupeKey");

-- CreateIndex
CREATE INDEX "WeeklyAuditEvent_cycleId_createdAt_idx" ON "WeeklyAuditEvent"("cycleId", "createdAt");

-- CreateIndex
CREATE INDEX "Evaluation_periodId_source_idx" ON "Evaluation"("periodId", "source");

-- AddForeignKey
ALTER TABLE "WeeklyCompetencyPrompt" ADD CONSTRAINT "WeeklyCompetencyPrompt_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "WeeklyCompetency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyProfile" ADD CONSTRAINT "WeeklyProfile_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "WeeklyCompetency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklySlot" ADD CONSTRAINT "WeeklySlot_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "WeeklyCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklySlot" ADD CONSTRAINT "WeeklySlot_competencyId_fkey" FOREIGN KEY ("competencyId") REFERENCES "WeeklyCompetency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyPrompt" ADD CONSTRAINT "WeeklyPrompt_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "WeeklyCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyPrompt" ADD CONSTRAINT "WeeklyPrompt_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "WeeklySlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyResponse" ADD CONSTRAINT "WeeklyResponse_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "WeeklyPrompt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
