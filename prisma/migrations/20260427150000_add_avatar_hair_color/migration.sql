-- Add explicit hair-color column for office avatar v2.
-- Existing users default to NULL; resolveAvatarV2Settings() falls back to a
-- seed-derived color until the user picks one in the avatar editor.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarHairColor" TEXT;
