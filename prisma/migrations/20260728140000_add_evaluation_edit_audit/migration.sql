-- Audit trail for HR corrections to submitted evaluations.
--
-- Submitted evaluations are locked for everyone, so a mis-clicked rating could not
-- be fixed at all. HR can now correct them, and because these scores feed the
-- reports employees receive, every correction records who made it and what the
-- value was before.

CREATE TABLE "EvaluationEdit" (
    "id" TEXT NOT NULL,
    "evaluationId" TEXT NOT NULL,
    "editedById" TEXT NOT NULL,
    "previousRating" DOUBLE PRECISION,
    "newRating" DOUBLE PRECISION,
    "previousText" TEXT,
    "newText" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationEdit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EvaluationEdit_evaluationId_idx" ON "EvaluationEdit"("evaluationId");
CREATE INDEX "EvaluationEdit_editedById_idx" ON "EvaluationEdit"("editedById");

ALTER TABLE "EvaluationEdit" ADD CONSTRAINT "EvaluationEdit_evaluationId_fkey"
  FOREIGN KEY ("evaluationId") REFERENCES "Evaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EvaluationEdit" ADD CONSTRAINT "EvaluationEdit_editedById_fkey"
  FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
