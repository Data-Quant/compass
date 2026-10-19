-- The weekly number of questions is now worked out per evaluator (five per person a quarter), not set by HR.
ALTER TABLE "WeeklyCycle" DROP COLUMN "weeklyCap";
