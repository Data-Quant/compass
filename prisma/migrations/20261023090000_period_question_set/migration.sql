-- CreateTable
CREATE TABLE "EvaluationPeriodQuestion" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "relationshipType" "RelationshipType" NOT NULL,
    "evaluatorId" TEXT,
    "questionId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluationPeriodQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EvaluationPeriodQuestion_periodId_relationshipType_idx" ON "EvaluationPeriodQuestion"("periodId", "relationshipType");

-- AddForeignKey
ALTER TABLE "EvaluationPeriodQuestion" ADD CONSTRAINT "EvaluationPeriodQuestion_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "EvaluationPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationPeriodQuestion" ADD CONSTRAINT "EvaluationPeriodQuestion_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "EvaluationQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluationPeriodQuestion" ADD CONSTRAINT "EvaluationPeriodQuestion_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

