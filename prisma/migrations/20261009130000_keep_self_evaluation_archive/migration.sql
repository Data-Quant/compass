-- Past quarterly self-evaluations are kept as a read-only archive. An earlier version of
-- 20261003100000_remove_self_evaluation dropped these tables; this puts them back, empty, where that already ran, and
-- changes nothing where they still exist.
DO $$ BEGIN
  CREATE TYPE "SelfEvaluationQuestionType" AS ENUM ('TEXT', 'LIST', 'GOAL_TABLE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "SelfEvaluationStatus" AS ENUM ('DRAFT', 'SUBMITTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SelfEvaluationQuestion" (
  "id" TEXT NOT NULL,
  "section" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "helpText" TEXT,
  "type" "SelfEvaluationQuestionType" NOT NULL DEFAULT 'TEXT',
  "orderIndex" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SelfEvaluationQuestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SelfEvaluation" (
  "id" TEXT NOT NULL,
  "periodId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "status" "SelfEvaluationStatus" NOT NULL DEFAULT 'DRAFT',
  "answers" JSONB NOT NULL DEFAULT '[]',
  "startedAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SelfEvaluation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SelfEvaluationQuestion_isActive_orderIndex_idx" ON "SelfEvaluationQuestion"("isActive", "orderIndex");
CREATE UNIQUE INDEX IF NOT EXISTS "SelfEvaluation_periodId_employeeId_key" ON "SelfEvaluation"("periodId", "employeeId");
CREATE INDEX IF NOT EXISTS "SelfEvaluation_periodId_idx" ON "SelfEvaluation"("periodId");
CREATE INDEX IF NOT EXISTS "SelfEvaluation_employeeId_idx" ON "SelfEvaluation"("employeeId");
CREATE INDEX IF NOT EXISTS "SelfEvaluation_status_idx" ON "SelfEvaluation"("status");

DO $$ BEGIN
  ALTER TABLE "SelfEvaluation" ADD CONSTRAINT "SelfEvaluation_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "EvaluationPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE "SelfEvaluation" ADD CONSTRAINT "SelfEvaluation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
