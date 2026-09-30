-- AlterTable
ALTER TABLE "Kpi" ADD COLUMN "dueDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "KpiComment" (
    "id" TEXT NOT NULL,
    "kpiId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KpiComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KpiComment_kpiId_createdAt_idx" ON "KpiComment"("kpiId", "createdAt");

-- AddForeignKey
ALTER TABLE "KpiComment" ADD CONSTRAINT "KpiComment_kpiId_fkey" FOREIGN KEY ("kpiId") REFERENCES "Kpi"("id") ON DELETE CASCADE ON UPDATE CASCADE;
