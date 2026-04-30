CREATE TABLE "EvaluationPeriodAssignmentSnapshot" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "evaluatorId" TEXT NOT NULL,
    "evaluateeId" TEXT NOT NULL,
    "relationshipType" "RelationshipType" NOT NULL,
    "source" TEXT NOT NULL,
    "sourceRefId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationPeriodAssignmentSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EvaluationPeriodAssignmentSnapshot_periodId_evaluatorId_evaluateeId_relationshipType_key" ON "EvaluationPeriodAssignmentSnapshot"("periodId", "evaluatorId", "evaluateeId", "relationshipType");
CREATE INDEX "EvaluationPeriodAssignmentSnapshot_periodId_idx" ON "EvaluationPeriodAssignmentSnapshot"("periodId");
CREATE INDEX "EvaluationPeriodAssignmentSnapshot_evaluatorId_idx" ON "EvaluationPeriodAssignmentSnapshot"("evaluatorId");
CREATE INDEX "EvaluationPeriodAssignmentSnapshot_evaluateeId_idx" ON "EvaluationPeriodAssignmentSnapshot"("evaluateeId");

ALTER TABLE "EvaluationPeriodAssignmentSnapshot" ADD CONSTRAINT "EvaluationPeriodAssignmentSnapshot_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "EvaluationPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvaluationPeriodAssignmentSnapshot" ADD CONSTRAINT "EvaluationPeriodAssignmentSnapshot_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvaluationPeriodAssignmentSnapshot" ADD CONSTRAINT "EvaluationPeriodAssignmentSnapshot_evaluateeId_fkey" FOREIGN KEY ("evaluateeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
