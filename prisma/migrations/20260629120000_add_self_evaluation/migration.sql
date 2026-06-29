-- CreateEnum
CREATE TYPE "SelfEvaluationQuestionType" AS ENUM ('TEXT', 'LIST', 'GOAL_TABLE');
CREATE TYPE "SelfEvaluationStatus" AS ENUM ('DRAFT', 'SUBMITTED');

-- AlterTable
ALTER TABLE "EvaluationPeriod"
  ADD COLUMN "selfEvaluationTriggeredAt" TIMESTAMP(3),
  ADD COLUMN "selfEvaluationTriggeredById" TEXT;

-- CreateTable
CREATE TABLE "SelfEvaluationQuestion" (
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

CREATE TABLE "SelfEvaluation" (
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

-- CreateIndex
CREATE INDEX "SelfEvaluationQuestion_isActive_orderIndex_idx" ON "SelfEvaluationQuestion"("isActive", "orderIndex");
CREATE UNIQUE INDEX "SelfEvaluation_periodId_employeeId_key" ON "SelfEvaluation"("periodId", "employeeId");
CREATE INDEX "SelfEvaluation_periodId_idx" ON "SelfEvaluation"("periodId");
CREATE INDEX "SelfEvaluation_employeeId_idx" ON "SelfEvaluation"("employeeId");
CREATE INDEX "SelfEvaluation_status_idx" ON "SelfEvaluation"("status");

-- AddForeignKey
ALTER TABLE "EvaluationPeriod" ADD CONSTRAINT "EvaluationPeriod_selfEvaluationTriggeredById_fkey" FOREIGN KEY ("selfEvaluationTriggeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SelfEvaluation" ADD CONSTRAINT "SelfEvaluation_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "EvaluationPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SelfEvaluation" ADD CONSTRAINT "SelfEvaluation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed the default self-evaluation question bank (Plutus21 Self-Evaluation Form)
INSERT INTO "SelfEvaluationQuestion" ("id", "section", "prompt", "helpText", "type", "orderIndex", "isActive", "updatedAt") VALUES
  ('seval_q01', 'Key Accomplishments', 'What were your most significant achievements during this review period?', NULL, 'LIST', 1, true, CURRENT_TIMESTAMP),
  ('seval_q02', 'Goal Progress', 'Review the goals set with your Team Lead for this period. For each goal, indicate your progress.', 'Add a row per goal with its status and any comments.', 'GOAL_TABLE', 2, true, CURRENT_TIMESTAMP),
  ('seval_q03', 'Strengths', 'What do you consider your greatest strengths in your role?', NULL, 'TEXT', 3, true, CURRENT_TIMESTAMP),
  ('seval_q04', 'Areas for Development', 'What obstacles or challenges have you faced in your role?', NULL, 'TEXT', 4, true, CURRENT_TIMESTAMP),
  ('seval_q05', 'Learning & Development', 'What new skills or knowledge have you acquired during this period?', NULL, 'TEXT', 5, true, CURRENT_TIMESTAMP),
  ('seval_q06', 'Collaboration & Impact', 'How have you contributed to team success?', NULL, 'TEXT', 6, true, CURRENT_TIMESTAMP),
  ('seval_q07', 'Goals for Next Review Period', 'What are your top 3-5 goals for the next review period?', NULL, 'LIST', 7, true, CURRENT_TIMESTAMP),
  ('seval_q08', 'Career Development', 'What are your career aspirations within the organization?', NULL, 'TEXT', 8, true, CURRENT_TIMESTAMP),
  ('seval_q09', 'Feedback & Support', 'What feedback do you have for your team lead or management?', NULL, 'TEXT', 9, true, CURRENT_TIMESTAMP);
