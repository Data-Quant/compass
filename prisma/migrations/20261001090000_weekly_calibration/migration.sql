-- AlterTable
ALTER TABLE "WeeklyCycle" ADD COLUMN     "classicFormOpen" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "classicFormOpenedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "WeeklyAiSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "activeModel" TEXT,
    "prices" JSONB NOT NULL DEFAULT '{}',
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyAiSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyCalibrationItem" (
    "id" TEXT NOT NULL,
    "competencyId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "situation" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "shortfall" TEXT,
    "hrSufficiency" TEXT NOT NULL,
    "hrScore" INTEGER,
    "note" TEXT,
    "sourceResponseId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "WeeklyCalibrationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyCalibrationRun" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "cycleId" TEXT,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "itemCount" INTEGER NOT NULL,
    "leaseUntil" TIMESTAMP(3),
    "startedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "summary" JSONB,

    CONSTRAINT "WeeklyCalibrationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyCalibrationResult" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "itemId" TEXT,
    "responseId" TEXT,
    "competencyId" TEXT NOT NULL,
    "targetSufficiency" TEXT NOT NULL,
    "targetScore" DOUBLE PRECISION,
    "sufficiency" TEXT,
    "score" INTEGER,
    "confidence" TEXT,
    "rationale" TEXT,
    "flags" JSONB,
    "evidenceQuotes" JSONB,
    "profileId" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyCalibrationResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyCalibrationItem_sourceResponseId_key" ON "WeeklyCalibrationItem"("sourceResponseId");

-- CreateIndex
CREATE INDEX "WeeklyCalibrationItem_archivedAt_idx" ON "WeeklyCalibrationItem"("archivedAt");

-- CreateIndex
CREATE INDEX "WeeklyCalibrationRun_kind_status_promptVersion_model_idx" ON "WeeklyCalibrationRun"("kind", "status", "promptVersion", "model");

-- CreateIndex
CREATE INDEX "WeeklyCalibrationResult_runId_completedAt_idx" ON "WeeklyCalibrationResult"("runId", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyCalibrationResult_runId_itemId_key" ON "WeeklyCalibrationResult"("runId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyCalibrationResult_runId_responseId_key" ON "WeeklyCalibrationResult"("runId", "responseId");

-- AddForeignKey
ALTER TABLE "WeeklyCalibrationResult" ADD CONSTRAINT "WeeklyCalibrationResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WeeklyCalibrationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
