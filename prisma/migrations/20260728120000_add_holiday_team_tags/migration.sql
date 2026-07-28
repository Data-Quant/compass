-- Public holidays become team-scoped.
--
-- Holidays are national: Eid applies in Pakistan, not in Morocco or Colombia.
-- Until now every holiday applied to everyone, which also meant it counted
-- against everyone's working days -- the denominator for travel allowance.

-- Empty default, so any row that somehow escapes the backfill keeps the old
-- company-wide behaviour rather than silently applying to nobody.
ALTER TABLE "PayrollPublicHoliday" ADD COLUMN "teamTags" "TeamTag"[] DEFAULT ARRAY[]::"TeamTag"[];

-- Every holiday recorded so far is Pakistani (Eid-ul-Adha, Ashura). Tag them for
-- both Pakistan teams, covering everyone physically in the country regardless of
-- which entity employs them. This keeps travel allowance identical for the people
-- who receive it, all of whom are on the Pakistan team.
UPDATE "PayrollPublicHoliday"
SET "teamTags" = ARRAY['PAKISTAN', 'THREE_E_PAKISTAN']::"TeamTag"[]
WHERE "teamTags" IS NULL OR cardinality("teamTags") = 0;

-- The default existed only so the backfill above could not leave NULLs behind.
-- Dropping it keeps the column shape identical to what Prisma generates for a
-- scalar list, so this migration adds no new schema drift.
ALTER TABLE "PayrollPublicHoliday" ALTER COLUMN "teamTags" DROP DEFAULT;

-- The date alone can no longer be unique: two countries can each have a distinct
-- holiday on the same day. Uniqueness moves to the date plus the holiday name, so
-- one shared holiday stays a single row carrying several team tags.
DROP INDEX IF EXISTS "PayrollPublicHoliday_holidayDate_key";

CREATE UNIQUE INDEX "PayrollPublicHoliday_holidayDate_name_key"
  ON "PayrollPublicHoliday"("holidayDate", "name");
