-- The weekly company sentiment survey: a per-quarter bank, answers (anonymous ones carry no user), and who has answered.
CREATE TYPE "SurveyQuestionKind" AS ENUM ('NPS', 'AGREE', 'CHOICE', 'TEXT');

CREATE TABLE "SurveyQuestion" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "kind" "SurveyQuestionKind" NOT NULL,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "required" BOOLEAN NOT NULL DEFAULT true,
    "explainChoice" BOOLEAN NOT NULL DEFAULT false,
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SurveyQuestion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SurveyQuestion_periodId_idx" ON "SurveyQuestion"("periodId");

CREATE TABLE "SurveyResponse" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "weekIndex" INTEGER NOT NULL,
    "userId" TEXT,
    "value" INTEGER,
    "choice" TEXT,
    "text" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SurveyResponse_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SurveyResponse_periodId_questionId_idx" ON "SurveyResponse"("periodId", "questionId");

CREATE TABLE "SurveyCompletion" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SurveyCompletion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SurveyCompletion_periodId_questionId_userId_key" ON "SurveyCompletion"("periodId", "questionId", "userId");
