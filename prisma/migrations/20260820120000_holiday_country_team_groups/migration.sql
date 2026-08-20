-- Pakistani public holidays reach both Pakistan entities.
--
-- PAKISTAN and THREE_E_PAKISTAN are one country split by employing entity, and a
-- Pakistani national holiday applies to everyone there. That is the same reasoning
-- the original tagging migration used when it backfilled both Pakistan teams.
--
-- Hand-tagging drifted from it: 14 August 2026 (Independence Day) was tagged
-- PAKISTAN alone, leaving 3E Pakistan's staff shown a full 21-day August and
-- expected to work a national holiday. Working days are the denominator for travel
-- allowance, so a missing tag quietly changes pay.
--
-- Morocco is deliberately NOT touched. 3E Morocco observes US public holidays, not
-- Moroccan ones, so widening Moroccan holidays to them would take three days off 24
-- people who actually work those days.
--
-- Going forward the API widens tags on save (expandHolidayTeamTags in
-- lib/holidays.ts). This repairs rows written before that existed.

UPDATE "PayrollPublicHoliday"
SET "teamTags" = array_append("teamTags", 'THREE_E_PAKISTAN'::"TeamTag")
WHERE 'PAKISTAN' = ANY("teamTags")
  AND NOT ('THREE_E_PAKISTAN' = ANY("teamTags"));

UPDATE "PayrollPublicHoliday"
SET "teamTags" = array_append("teamTags", 'PAKISTAN'::"TeamTag")
WHERE 'THREE_E_PAKISTAN' = ANY("teamTags")
  AND NOT ('PAKISTAN' = ANY("teamTags"));
