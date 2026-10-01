-- The classic questionnaire is gone, so there is no fallback to open.
ALTER TABLE "WeeklyCycle" DROP COLUMN "classicFormOpen",
DROP COLUMN "classicFormOpenedAt";
