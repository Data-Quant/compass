-- Phase 2 (UX spec, section 6): the lead alone approves a peer change; the peer only replies.
ALTER TYPE "PeerChangeStatus" ADD VALUE 'NEEDS_INFO';

CREATE TYPE "PeerReply" AS ENUM ('WORK_TOGETHER', 'NOT_WORK_TOGETHER');
CREATE TYPE "MappingReasonCode" AS ENUM ('NO_LONGER_WORK_TOGETHER', 'WRONG_PERSON', 'OTHER');

ALTER TABLE "PeerChangeRequest"
  ADD COLUMN "reasonCode" "MappingReasonCode",
  ADD COLUMN "peerReply" "PeerReply",
  ADD COLUMN "peerRepliedAt" TIMESTAMP(3),
  ADD COLUMN "remindedAt" TIMESTAMP(3),
  ADD COLUMN "decisionNote" TEXT,
  ADD COLUMN "answer" TEXT;

-- A peer who already voted keeps that as their reply.
UPDATE "PeerChangeRequest" SET "peerReply" = 'WORK_TOGETHER', "peerRepliedAt" = "peerVotedAt"
  WHERE "peerVote" = 'APPROVED' AND "action" = 'ADD';
UPDATE "PeerChangeRequest" SET "peerReply" = 'NOT_WORK_TOGETHER', "peerRepliedAt" = "peerVotedAt"
  WHERE ("peerVote" = 'APPROVED' AND "action" = 'REMOVE') OR ("peerVote" = 'REJECTED' AND "action" = 'ADD');
UPDATE "PeerChangeRequest" SET "peerReply" = 'WORK_TOGETHER', "peerRepliedAt" = "peerVotedAt"
  WHERE "peerVote" = 'REJECTED' AND "action" = 'REMOVE';

ALTER TABLE "PeerChangeRequest" DROP COLUMN "peerVote", DROP COLUMN "peerVotedAt";

CREATE TABLE "MappingConfirmation" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MappingConfirmation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MappingConfirmation_periodId_userId_key" ON "MappingConfirmation"("periodId", "userId");
