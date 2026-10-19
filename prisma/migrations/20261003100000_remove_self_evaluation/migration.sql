-- The quarterly self-evaluation form is retired. Its trigger columns and the mapping flag go; the answers it collected
-- stay, read-only, in "SelfEvaluation" and "SelfEvaluationQuestion" (see 20261009130000_keep_self_evaluation_archive).

-- DropForeignKey
ALTER TABLE "EvaluationPeriod" DROP CONSTRAINT "EvaluationPeriod_selfEvaluationTriggeredById_fkey";

-- AlterTable
ALTER TABLE "EvaluationPeriod" DROP COLUMN "selfEvaluationTriggeredAt",
DROP COLUMN "selfEvaluationTriggeredById";

-- AlterTable
ALTER TABLE "EvaluatorMapping" DROP COLUMN "isSelfEvaluation";
