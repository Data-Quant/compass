-- AlterTable
ALTER TABLE "WeeklyCompetencyPrompt" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "WeeklyCompetency" ADD COLUMN "removedAt" TIMESTAMP(3);
