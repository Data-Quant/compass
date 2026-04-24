-- Allow decimal rating values (e.g. 3.5, 3.25) for evaluators like Hamiz
-- whose scoring style produces fractional ratings. Widening an INTEGER to
-- DOUBLE PRECISION preserves existing values and does not require a backfill.
ALTER TABLE "Evaluation" ALTER COLUMN "ratingValue" TYPE DOUBLE PRECISION USING "ratingValue"::double precision;
