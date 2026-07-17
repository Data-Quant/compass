-- Handbook presentation fields: additive only.
--
-- Hand-written rather than generated. `prisma migrate diff` also emits three
-- ALTER INDEX ... RENAME statements for EvaluationPeriodAssignmentOverride,
-- EvaluationPeriodAssignmentSnapshot and ProjectNotificationDigestItem. That is
-- PRE-EXISTING drift between the live database and schema.prisma (Postgres
-- truncates identifiers at 63 chars; those indexes were created under different
-- truncated names). It is unrelated to this work and is deliberately excluded --
-- this migration must not alter anything that already exists.

-- CreateEnum
CREATE TYPE "HandbookLayout" AS ENUM ('POLICY', 'LETTER');

-- AlterTable
ALTER TABLE "HandbookPage" ADD COLUMN     "description" TEXT,
ADD COLUMN     "layout" "HandbookLayout";
