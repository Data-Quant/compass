-- Phase 3: answers carry their score (multiple choice), so AI scoring, HR review, calibration, challenges and rubric
-- profiles go, with the free-text answer boxes.
-- Questions asked under the free-text model have no statements, so they cannot be answered now: open ones are
-- cancelled. Answered ones have no score, so they no longer count as answered, and their topics can be asked again.
UPDATE "WeeklyPrompt" SET "status" = 'CANCELLED' WHERE "kind" = 'STANDARD' AND "options" IS NULL AND "status" IN ('OPEN', 'DRAFT');
UPDATE "WeeklyPrompt" SET "status" = 'EXPIRED' WHERE "kind" = 'STANDARD' AND "options" IS NULL AND "status" = 'SUBMITTED';
UPDATE "WeeklySlot" s SET "status" = 'OPEN' WHERE s."status" = 'SATISFIED'
  AND NOT EXISTS (SELECT 1 FROM "WeeklyPrompt" p WHERE p."slotId" = s."id" AND p."status" = 'SUBMITTED');

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

