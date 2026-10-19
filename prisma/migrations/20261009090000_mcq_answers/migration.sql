-- Phase 3 (UX spec, section 8): multiple-choice weekly questions; the chosen statement carries the score.
ALTER TABLE "WeeklyCompetency" ADD COLUMN "departments" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "WeeklyCompetencyPrompt" ADD COLUMN "options" JSONB;
ALTER TABLE "WeeklyPrompt" ADD COLUMN "options" JSONB;
ALTER TABLE "WeeklyResponse" ADD COLUMN "optionId" TEXT, ADD COLUMN "score" DOUBLE PRECISION, ADD COLUMN "note" TEXT;
