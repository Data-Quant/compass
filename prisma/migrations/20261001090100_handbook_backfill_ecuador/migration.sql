-- Data: every handbook variant that already covers all five existing internal
-- teams (Pakistan, Morocco, Colombia, Indonesia, Noble) was authored for
-- "Plutus21 Internal" or "Everyone", so Ecuador is added to it. Variants
-- targeted at specific countries are left alone for HR to review.
INSERT INTO "HandbookAudience" ("variantId", "team")
SELECT v."id", 'ECUADOR'::"TeamTag"
FROM "HandbookVariant" v
WHERE (
  SELECT COUNT(DISTINCT a."team")
  FROM "HandbookAudience" a
  WHERE a."variantId" = v."id"
    AND a."team" IN ('PAKISTAN', 'MOROCCO', 'COLOMBIA', 'INDONESIA', 'NOBLE')
) = 5
AND NOT EXISTS (
  SELECT 1 FROM "HandbookAudience" a
  WHERE a."variantId" = v."id" AND a."team" = 'ECUADOR'
);
