-- The evaluation round page: a review deadline per round, and requests that expire when the round opens.
ALTER TYPE "PeerChangeStatus" ADD VALUE IF NOT EXISTS 'EXPIRED';
ALTER TABLE "WeeklyCycle" ADD COLUMN "reviewDeadline" TIMESTAMP(3);
