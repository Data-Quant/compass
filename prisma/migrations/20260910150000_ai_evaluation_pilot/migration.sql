-- CreateTable
CREATE TABLE "AiEvaluationCycle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "config" JSONB NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiEvaluationCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiEvaluationCheckIn" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "evaluatorId" TEXT NOT NULL,
    "evaluateeId" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "competencyId" TEXT NOT NULL,
    "week" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'GENERATING',
    "question" TEXT,
    "answer" TEXT NOT NULL DEFAULT '',
    "clarification" TEXT,
    "clarificationAnswer" TEXT NOT NULL DEFAULT '',
    "noInteraction" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "history" JSONB NOT NULL DEFAULT '[]',
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiEvaluationCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiEvaluationObservation" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "checkInId" TEXT NOT NULL,
    "evaluateeId" TEXT NOT NULL,
    "evaluatorId" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "competencyId" TEXT NOT NULL,
    "week" INTEGER NOT NULL,
    "incidentKey" TEXT NOT NULL,
    "concrete" BOOLEAN NOT NULL,
    "text" TEXT NOT NULL,
    "sourceQuote" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiEvaluationObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiEvaluationJob" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseUntil" TIMESTAMP(3),
    "leaseToken" TEXT,
    "error" TEXT,
    "model" TEXT,
    "promptVersion" TEXT NOT NULL DEFAULT '1',
    "rubricVersion" INTEGER NOT NULL,
    "inputReferences" JSONB NOT NULL DEFAULT '[]',
    "usage" JSONB,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiEvaluationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiEvaluationArtifact" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "evaluateeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "content" JSONB NOT NULL,
    "jobId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiEvaluationArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiEvaluationReview" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "ratings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiEvaluationReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiEvaluationTheme" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "evaluateeId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sourceIds" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "corrections" JSONB NOT NULL DEFAULT '[]',
    "history" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiEvaluationTheme_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiEvaluationCycle_status_startDate_idx" ON "AiEvaluationCycle"("status", "startDate");

-- CreateIndex
CREATE INDEX "AiEvaluationCheckIn_evaluatorId_status_idx" ON "AiEvaluationCheckIn"("evaluatorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AiEvaluationCheckIn_cycleId_evaluatorId_evaluateeId_relatio_key" ON "AiEvaluationCheckIn"("cycleId", "evaluatorId", "evaluateeId", "relationship", "week");

-- CreateIndex
CREATE INDEX "AiEvaluationObservation_cycleId_evaluateeId_idx" ON "AiEvaluationObservation"("cycleId", "evaluateeId");

-- CreateIndex
CREATE UNIQUE INDEX "AiEvaluationObservation_checkInId_sourceQuote_key" ON "AiEvaluationObservation"("checkInId", "sourceQuote");

-- CreateIndex
CREATE UNIQUE INDEX "AiEvaluationJob_key_key" ON "AiEvaluationJob"("key");

-- CreateIndex
CREATE INDEX "AiEvaluationJob_status_runAfter_idx" ON "AiEvaluationJob"("status", "runAfter");

-- CreateIndex
CREATE UNIQUE INDEX "AiEvaluationArtifact_jobId_key" ON "AiEvaluationArtifact"("jobId");

-- CreateIndex
CREATE INDEX "AiEvaluationArtifact_cycleId_evaluateeId_kind_idx" ON "AiEvaluationArtifact"("cycleId", "evaluateeId", "kind");

-- CreateIndex
CREATE INDEX "AiEvaluationTheme_evaluateeId_status_idx" ON "AiEvaluationTheme"("evaluateeId", "status");

-- AddForeignKey
ALTER TABLE "AiEvaluationCheckIn" ADD CONSTRAINT "AiEvaluationCheckIn_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AiEvaluationCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiEvaluationObservation" ADD CONSTRAINT "AiEvaluationObservation_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AiEvaluationCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiEvaluationObservation" ADD CONSTRAINT "AiEvaluationObservation_checkInId_fkey" FOREIGN KEY ("checkInId") REFERENCES "AiEvaluationCheckIn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiEvaluationJob" ADD CONSTRAINT "AiEvaluationJob_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AiEvaluationCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiEvaluationArtifact" ADD CONSTRAINT "AiEvaluationArtifact_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AiEvaluationCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiEvaluationReview" ADD CONSTRAINT "AiEvaluationReview_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AiEvaluationCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiEvaluationReview" ADD CONSTRAINT "AiEvaluationReview_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "AiEvaluationArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiEvaluationTheme" ADD CONSTRAINT "AiEvaluationTheme_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "AiEvaluationCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
