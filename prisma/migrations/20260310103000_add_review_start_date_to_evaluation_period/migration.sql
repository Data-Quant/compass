ALTER TABLE "EvaluationPeriod"
ADD COLUMN "reviewStartDate" TIMESTAMP(3);

UPDATE "EvaluationPeriod"
SET "reviewStartDate" = "endDate" + INTERVAL '7 days'
WHERE "reviewStartDate" IS NULL;

ALTER TABLE "EvaluationPeriod"
ALTER COLUMN "reviewStartDate" SET NOT NULL;

CREATE INDEX "EvaluationPeriod_reviewStartDate_idx" ON "EvaluationPeriod"("reviewStartDate");
