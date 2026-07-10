-- Carry a lead's pre-evaluation questions forward into a new period by default.
-- questionsCarriedForwardAt marks a prep whose questions were auto-carried (effective
-- in evaluations, still editable until review start); questionsCarriedFromPeriodId
-- records the source period for the "carried from {period}" label. Both nullable so
-- existing rows are unaffected.
ALTER TABLE "PreEvaluationLeadPrep" ADD COLUMN "questionsCarriedForwardAt" TIMESTAMP(3),
ADD COLUMN "questionsCarriedFromPeriodId" TEXT;
