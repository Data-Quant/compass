-- Phase 3: answers carry their score (multiple choice), so AI scoring, HR review, calibration, challenges and rubric
-- profiles go, with the free-text answer boxes.
-- DropForeignKey
ALTER TABLE "WeeklyCalibrationResult" DROP CONSTRAINT "WeeklyCalibrationResult_runId_fkey";

-- DropForeignKey
ALTER TABLE "WeeklyProfile" DROP CONSTRAINT "WeeklyProfile_competencyId_fkey";

-- AlterTable
ALTER TABLE "WeeklyResponse" DROP COLUMN "action",
DROP COLUMN "result",
DROP COLUMN "shortfall",
DROP COLUMN "situation";

-- DropTable
DROP TABLE "WeeklyAiScore";

-- DropTable
DROP TABLE "WeeklyAiSettings";

-- DropTable
DROP TABLE "WeeklyCalibrationItem";

-- DropTable
DROP TABLE "WeeklyCalibrationResult";

-- DropTable
DROP TABLE "WeeklyCalibrationRun";

-- DropTable
DROP TABLE "WeeklyChallenge";

-- DropTable
DROP TABLE "WeeklyProfile";

-- DropTable
DROP TABLE "WeeklyScoreReview";

-- DropTable
DROP TABLE "WeeklyScoringJob";

-- DropEnum
DROP TYPE "WeeklyChallengeStatus";

-- DropEnum
DROP TYPE "WeeklyProfileStatus";

-- DropEnum
DROP TYPE "WeeklyReviewAction";

