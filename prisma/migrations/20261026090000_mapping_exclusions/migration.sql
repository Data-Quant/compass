-- CreateTable
CREATE TABLE "EvaluatorMappingExclusion" (
    "id" TEXT NOT NULL,
    "evaluatorId" TEXT NOT NULL,
    "evaluateeId" TEXT NOT NULL,
    "relationshipType" "RelationshipType" NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluatorMappingExclusion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EvaluatorMappingExclusion_evaluateeId_idx" ON "EvaluatorMappingExclusion"("evaluateeId");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluatorMappingExclusion_evaluatorId_evaluateeId_relations_key" ON "EvaluatorMappingExclusion"("evaluatorId", "evaluateeId", "relationshipType");

-- AddForeignKey
ALTER TABLE "EvaluatorMappingExclusion" ADD CONSTRAINT "EvaluatorMappingExclusion_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluatorMappingExclusion" ADD CONSTRAINT "EvaluatorMappingExclusion_evaluateeId_fkey" FOREIGN KEY ("evaluateeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

