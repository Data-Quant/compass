-- UX spec, section 12: the monthly self-evaluation. Never scored; it goes to the person's leads and HR on submit.
-- CreateTable
CREATE TABLE "SelfReviewQuestion" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "parts" TEXT[],
    "discussOption" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SelfReviewQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SelfReview" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "answers" TEXT[],
    "wantsDiscussion" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SelfReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SelfReviewRead" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "reply" TEXT,
    "repliedAt" TIMESTAMP(3),
    "remindedAt" TIMESTAMP(3),

    CONSTRAINT "SelfReviewRead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SelfReviewQuestion_periodId_month_key" ON "SelfReviewQuestion"("periodId", "month");

-- CreateIndex
CREATE INDEX "SelfReview_periodId_month_idx" ON "SelfReview"("periodId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "SelfReview_periodId_month_userId_key" ON "SelfReview"("periodId", "month", "userId");

-- CreateIndex
CREATE INDEX "SelfReviewRead_leadId_idx" ON "SelfReviewRead"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "SelfReviewRead_reviewId_leadId_key" ON "SelfReviewRead"("reviewId", "leadId");

-- AddForeignKey
ALTER TABLE "SelfReviewRead" ADD CONSTRAINT "SelfReviewRead_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "SelfReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

