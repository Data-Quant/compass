-- When HR opened the round: anyone who joins after it is left out of the round (UX spec, section 7).
ALTER TABLE "WeeklyCycle" ADD COLUMN "startedAt" TIMESTAMP(3);

-- Rounds already open or closed count from week 1.
UPDATE "WeeklyCycle" SET "startedAt" = "weekOneStartsOn" WHERE "status" <> 'SETUP' AND "startedAt" IS NULL;
