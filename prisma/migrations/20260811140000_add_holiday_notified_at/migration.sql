-- Remember which public holidays have actually been announced.
--
-- Without this, every press of "Send Digest" rebuilt the month from scratch and
-- re-announced holidays the team had already been told about. Adding one holiday
-- mid-month meant re-mailing everything in that month.
ALTER TABLE "PayrollPublicHoliday" ADD COLUMN "notifiedAt" TIMESTAMP(3);

-- Backfill every existing holiday as already announced.
--
-- Deliberately unconditional. There is no signal in the data that separates announced
-- from unannounced: the August 2026 holidays were all created on the 4th, after that
-- month's cron had already run on the 1st, and were then announced by hand. Any rule
-- based on createdAt or holidayDate therefore misclassifies them, and the failure
-- mode is the one this change exists to stop -- re-announcing a month that has
-- already gone out.
--
-- So the assumption is stated once, here, and it is the safe direction: nothing
-- recorded before this deploy is ever mailed again automatically. A holiday that
-- genuinely still needs announcing is announced explicitly from the holidays table,
-- which is exact and needs no guessing. Everything added after this deploy gets
-- notifiedAt = NULL naturally and is picked up by "Announce New Holidays".
UPDATE "PayrollPublicHoliday" SET "notifiedAt" = NOW() WHERE "notifiedAt" IS NULL;

-- No index: the table holds a few dozen rows and is already indexed on holidayDate,
-- which every query here filters on first.
