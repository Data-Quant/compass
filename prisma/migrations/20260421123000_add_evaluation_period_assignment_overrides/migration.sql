CREATE TYPE "EvaluationPeriodOverrideAction" AS ENUM ('ADD', 'REMOVE');

CREATE TABLE "EvaluationPeriodAssignmentOverride" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "evaluatorId" TEXT NOT NULL,
    "evaluateeId" TEXT NOT NULL,
    "relationshipType" "RelationshipType" NOT NULL,
    "action" "EvaluationPeriodOverrideAction" NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluationPeriodAssignmentOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EvaluationPeriodAssignmentOverride_periodId_evaluatorId_eval_key"
ON "EvaluationPeriodAssignmentOverride"("periodId", "evaluatorId", "evaluateeId", "relationshipType");

CREATE INDEX "EvaluationPeriodAssignmentOverride_periodId_idx"
ON "EvaluationPeriodAssignmentOverride"("periodId");

CREATE INDEX "EvaluationPeriodAssignmentOverride_evaluatorId_idx"
ON "EvaluationPeriodAssignmentOverride"("evaluatorId");

CREATE INDEX "EvaluationPeriodAssignmentOverride_evaluateeId_idx"
ON "EvaluationPeriodAssignmentOverride"("evaluateeId");

CREATE INDEX "EvaluationPeriodAssignmentOverride_action_idx"
ON "EvaluationPeriodAssignmentOverride"("action");

ALTER TABLE "EvaluationPeriodAssignmentOverride"
ADD CONSTRAINT "EvaluationPeriodAssignmentOverride_periodId_fkey"
FOREIGN KEY ("periodId") REFERENCES "EvaluationPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EvaluationPeriodAssignmentOverride"
ADD CONSTRAINT "EvaluationPeriodAssignmentOverride_evaluatorId_fkey"
FOREIGN KEY ("evaluatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EvaluationPeriodAssignmentOverride"
ADD CONSTRAINT "EvaluationPeriodAssignmentOverride_evaluateeId_fkey"
FOREIGN KEY ("evaluateeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EvaluationPeriodAssignmentOverride"
ADD CONSTRAINT "EvaluationPeriodAssignmentOverride_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
