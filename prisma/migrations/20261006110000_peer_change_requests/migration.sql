-- Employees ask to add or remove a peer; the peer and the employee's lead approve by email, or HR decides.
CREATE TYPE "PeerChangeAction" AS ENUM ('ADD', 'REMOVE');
CREATE TYPE "PeerChangeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "PeerChangeVote" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "PeerChangeRequest" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "peerId" TEXT NOT NULL,
    "action" "PeerChangeAction" NOT NULL,
    "reason" TEXT,
    "status" "PeerChangeStatus" NOT NULL DEFAULT 'PENDING',
    "peerVote" "PeerChangeVote" NOT NULL DEFAULT 'PENDING',
    "peerVotedAt" TIMESTAMP(3),
    "peerTokenHash" TEXT NOT NULL,
    "approverId" TEXT,
    "approverVote" "PeerChangeVote" NOT NULL DEFAULT 'PENDING',
    "approverVotedAt" TIMESTAMP(3),
    "approverTokenHash" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PeerChangeRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PeerChangeRequest_peerTokenHash_key" ON "PeerChangeRequest"("peerTokenHash");
CREATE UNIQUE INDEX "PeerChangeRequest_approverTokenHash_key" ON "PeerChangeRequest"("approverTokenHash");
CREATE INDEX "PeerChangeRequest_periodId_status_idx" ON "PeerChangeRequest"("periodId", "status");
CREATE INDEX "PeerChangeRequest_requesterId_idx" ON "PeerChangeRequest"("requesterId");
