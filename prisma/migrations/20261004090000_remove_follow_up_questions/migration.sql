-- Follow-up questions are gone: a thin answer goes to HR review instead of back to the evaluator.

-- Unanswered follow-ups are withdrawn; answered ones stay as ordinary answers on their topic.
DELETE FROM "WeeklyPrompt" p
WHERE p."kind" = 'FOLLOW_UP' AND NOT EXISTS (SELECT 1 FROM "WeeklyResponse" r WHERE r."promptId" = p."id");
UPDATE "WeeklyPrompt" SET "kind" = 'STANDARD' WHERE "kind" = 'FOLLOW_UP';

-- Topics closed after two thin follow-ups are open again.
UPDATE "WeeklySlot" SET "status" = 'OPEN' WHERE "status" = 'CLOSED_INSUFFICIENT';

ALTER TYPE "WeeklyPromptKind" RENAME TO "WeeklyPromptKind_old";
CREATE TYPE "WeeklyPromptKind" AS ENUM ('STANDARD', 'COMMENT');
ALTER TABLE "WeeklyPrompt" ALTER COLUMN "kind" DROP DEFAULT;
ALTER TABLE "WeeklyPrompt" ALTER COLUMN "kind" TYPE "WeeklyPromptKind" USING ("kind"::text::"WeeklyPromptKind");
ALTER TABLE "WeeklyPrompt" ALTER COLUMN "kind" SET DEFAULT 'STANDARD';
DROP TYPE "WeeklyPromptKind_old";

ALTER TYPE "WeeklySlotStatus" RENAME TO "WeeklySlotStatus_old";
CREATE TYPE "WeeklySlotStatus" AS ENUM ('OPEN', 'SATISFIED', 'CLOSED_NOT_OBSERVED', 'CANCELLED');
ALTER TABLE "WeeklySlot" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "WeeklySlot" ALTER COLUMN "status" TYPE "WeeklySlotStatus" USING ("status"::text::"WeeklySlotStatus");
ALTER TABLE "WeeklySlot" ALTER COLUMN "status" SET DEFAULT 'OPEN';
DROP TYPE "WeeklySlotStatus_old";

ALTER TABLE "WeeklySlot" DROP COLUMN "followUpCount";
ALTER TABLE "WeeklyAiScore" DROP COLUMN "followUpPrompt";
