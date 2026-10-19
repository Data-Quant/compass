-- D9 and D10 are Growth and Strategy topics (UX spec, section 9.2); the first bank load put them under Product.
-- Only rows still as loaded are corrected, so a change HR made stays.
UPDATE "WeeklyCompetency"
SET "departments" = ARRAY['Growth and Strategy']::TEXT[]
WHERE "key" IN ('LEAD.DEPT.D9', 'LEAD.DEPT.D10') AND "departments" = ARRAY['Product']::TEXT[];
