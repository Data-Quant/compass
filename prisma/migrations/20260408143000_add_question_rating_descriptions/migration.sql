ALTER TABLE "EvaluationQuestion"
ADD COLUMN "rating1Description" TEXT,
ADD COLUMN "rating2Description" TEXT,
ADD COLUMN "rating3Description" TEXT,
ADD COLUMN "rating4Description" TEXT;

ALTER TABLE "PreEvaluationLeadQuestion"
ADD COLUMN "rating1Description" TEXT,
ADD COLUMN "rating2Description" TEXT,
ADD COLUMN "rating3Description" TEXT,
ADD COLUMN "rating4Description" TEXT;
