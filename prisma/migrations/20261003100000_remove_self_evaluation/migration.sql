-- DropForeignKey
ALTER TABLE "EvaluationPeriod" DROP CONSTRAINT "EvaluationPeriod_selfEvaluationTriggeredById_fkey";

-- DropForeignKey
ALTER TABLE "SelfEvaluation" DROP CONSTRAINT "SelfEvaluation_employeeId_fkey";

-- DropForeignKey
ALTER TABLE "SelfEvaluation" DROP CONSTRAINT "SelfEvaluation_periodId_fkey";

-- AlterTable
ALTER TABLE "EvaluationPeriod" DROP COLUMN "selfEvaluationTriggeredAt",
DROP COLUMN "selfEvaluationTriggeredById";

-- AlterTable
ALTER TABLE "EvaluatorMapping" DROP COLUMN "isSelfEvaluation";

-- DropTable
DROP TABLE "SelfEvaluation";

-- DropTable
DROP TABLE "SelfEvaluationQuestion";

-- DropEnum
DROP TYPE "SelfEvaluationQuestionType";

-- DropEnum
DROP TYPE "SelfEvaluationStatus";

