-- "Submit this week" (UX spec, section 5).
CREATE TABLE "WeeklyWeekSubmission" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "evaluatorId" TEXT NOT NULL,
    "weekIndex" INTEGER NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyWeekSubmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WeeklyWeekSubmission_cycleId_evaluatorId_weekIndex_key" ON "WeeklyWeekSubmission"("cycleId", "evaluatorId", "weekIndex");

ALTER TABLE "WeeklyWeekSubmission" ADD CONSTRAINT "WeeklyWeekSubmission_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "WeeklyCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
