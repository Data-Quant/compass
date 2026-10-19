-- HR sets the number of question weeks; two catch-up weeks follow them.
ALTER TABLE "WeeklyCycle" ADD COLUMN "questionWeeks" INTEGER;

-- Existing cycles keep their length: every week from week 1 to the period's last day (Karachi), less two.
UPDATE "WeeklyCycle" c
SET "questionWeeks" = GREATEST(1,
  FLOOR(EXTRACT(EPOCH FROM (date_trunc('day', p."endDate") + interval '1 day' - interval '5 hours' - interval '1 millisecond' - c."weekOneStartsOn")) / 604800)::int + 1 - 2)
FROM "EvaluationPeriod" p
WHERE p."id" = c."periodId";

ALTER TABLE "WeeklyCycle" ALTER COLUMN "questionWeeks" SET NOT NULL;
