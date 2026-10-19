-- The evaluation round page: a review deadline per round, and requests that expire when the round opens.
ALTER TYPE "PeerChangeStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TABLE "WeeklyCycle" ADD COLUMN "reviewDeadline" TIMESTAMP(3);

-- HR accepts a mapping warning for a person in a round, with a reason.
CREATE TABLE "RoundWarningAcceptance" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "warning" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "acceptedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RoundWarningAcceptance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RoundWarningAcceptance_cycleId_userId_warning_key" ON "RoundWarningAcceptance"("cycleId", "userId", "warning");
