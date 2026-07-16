-- Company Handbook: additive only.
--
-- Hand-written rather than generated. `prisma migrate diff` also emits three
-- ALTER INDEX ... RENAME statements for EvaluationPeriodAssignmentOverride,
-- EvaluationPeriodAssignmentSnapshot and ProjectNotificationDigestItem. That is
-- PRE-EXISTING drift between the live database and schema.prisma (Postgres
-- truncates identifiers at 63 chars; those indexes were created under different
-- truncated names). It is unrelated to the Handbook and is deliberately
-- excluded -- this migration must not alter anything that already exists.

-- CreateEnum
CREATE TYPE "TeamTag" AS ENUM ('PAKISTAN', 'MOROCCO', 'COLOMBIA', 'INDONESIA', 'NOBLE', 'THREE_E_PAKISTAN', 'THREE_E_MOROCCO');

-- CreateEnum
CREATE TYPE "HandbookCategory" AS ENUM ('START_HERE', 'THE_COMPANY', 'POLICIES', 'BENEFITS_AND_REWARDS', 'PERFORMANCE', 'HOW_TO');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "teamTag" "TeamTag";

-- CreateTable
CREATE TABLE "HandbookPage" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "category" "HandbookCategory" NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "linkHref" TEXT,
    "linkLabel" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "intentionalGapTeams" "TeamTag"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HandbookPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandbookVariant" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "bodyMarkdown" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HandbookVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HandbookAudience" (
    "variantId" TEXT NOT NULL,
    "team" "TeamTag" NOT NULL,

    CONSTRAINT "HandbookAudience_pkey" PRIMARY KEY ("variantId","team")
);

-- CreateIndex
CREATE UNIQUE INDEX "HandbookPage_slug_key" ON "HandbookPage"("slug");

-- CreateIndex
CREATE INDEX "HandbookPage_category_orderIndex_idx" ON "HandbookPage"("category", "orderIndex");

-- CreateIndex
CREATE INDEX "HandbookVariant_pageId_idx" ON "HandbookVariant"("pageId");

-- CreateIndex
CREATE INDEX "HandbookAudience_team_idx" ON "HandbookAudience"("team");

-- AddForeignKey
ALTER TABLE "HandbookVariant" ADD CONSTRAINT "HandbookVariant_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "HandbookPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HandbookAudience" ADD CONSTRAINT "HandbookAudience_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "HandbookVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
