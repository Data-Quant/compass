-- Drop the legacy v1 avatar columns. Office v2 is now the only active avatar
-- system; v1 fields were no longer read or written by any code path. Existing
-- data in these columns is intentionally discarded (per the v2-only design,
-- users render with deterministic v2 defaults until they save a v2 avatar via
-- the /office setup prompt).
ALTER TABLE "User" DROP COLUMN IF EXISTS "avatarBodyType";
ALTER TABLE "User" DROP COLUMN IF EXISTS "avatarHairStyle";
ALTER TABLE "User" DROP COLUMN IF EXISTS "avatarHairColor";
ALTER TABLE "User" DROP COLUMN IF EXISTS "avatarShirtColor";

-- Bring legacy rows whose default was 1 up to 2 so the column value is
-- consistent for any future v3 migration. Runtime no longer reads this column.
UPDATE "User" SET "avatarSchemaVersion" = 2 WHERE "avatarSchemaVersion" < 2;
