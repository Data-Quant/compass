-- A pair added after the quarter started gets its five questions over its own weeks.
CREATE TABLE "WeeklyPairWindow" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "evaluatorId" TEXT NOT NULL,
    "evaluateeId" TEXT NOT NULL,
    "relationshipType" "RelationshipType" NOT NULL,
    "startWeek" INTEGER NOT NULL,
    "weeks" INTEGER NOT NULL,
    "setById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WeeklyPairWindow_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WeeklyPairWindow_cycleId_evaluatorId_evaluateeId_relationsh_key" ON "WeeklyPairWindow"("cycleId", "evaluatorId", "evaluateeId", "relationshipType");
CREATE INDEX "WeeklyPairWindow_cycleId_idx" ON "WeeklyPairWindow"("cycleId");
