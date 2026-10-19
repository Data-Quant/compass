-- The model scores multiple-choice answers and HR reviews every score. A chosen statement's score becomes its
-- level: HR's hidden guide for the model, not the score.
ALTER TABLE "WeeklyResponse" RENAME COLUMN "score" TO "level";

-- CreateEnum
CREATE TYPE "WeeklyReviewAction" AS ENUM ('ACCEPTED', 'ADJUSTED');

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
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "rationale" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyAiScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyScoreReview" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "aiScoreId" TEXT,
    "action" "WeeklyReviewAction" NOT NULL,
    "finalScore" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "reviewerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyScoreReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyAiSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "activeModel" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyAiSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WeeklyScoringJob_status_runAfter_idx" ON "WeeklyScoringJob"("status", "runAfter");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyScoringJob_responseId_revision_key" ON "WeeklyScoringJob"("responseId", "revision");

-- CreateIndex
CREATE INDEX "WeeklyAiScore_responseId_idx" ON "WeeklyAiScore"("responseId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyAiScore_responseId_revision_model_promptVersion_key" ON "WeeklyAiScore"("responseId", "revision", "model", "promptVersion");

-- CreateIndex
CREATE INDEX "WeeklyScoreReview_responseId_createdAt_idx" ON "WeeklyScoreReview"("responseId", "createdAt");


-- Answers already given are queued for scoring.
INSERT INTO "WeeklyScoringJob" ("id", "responseId", "revision", "updatedAt")
  SELECT gen_random_uuid()::text, r."id", r."revision", CURRENT_TIMESTAMP FROM "WeeklyResponse" r JOIN "WeeklyPrompt" p ON p."id" = r."promptId"
  WHERE p."kind" = 'STANDARD' AND p."status" = 'SUBMITTED' AND r."level" IS NOT NULL;
