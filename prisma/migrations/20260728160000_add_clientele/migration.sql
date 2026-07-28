-- Clientele: an HR-governed list of clients and who works on each one.
--
-- Deliberately separate from Project. Projects are created by any signed-in user
-- and own their own tasks; a client and its roster are set by HR alone.

CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "ClientRole" AS ENUM ('MANAGER', 'MEMBER');
CREATE TYPE "RosterRequestAction" AS ENUM ('ADD', 'REMOVE');
CREATE TYPE "RosterRequestStatus" AS ENUM ('PENDING', 'COMPLETED', 'DISMISSED');

CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Client_name_key" ON "Client"("name");
CREATE INDEX "Client_status_idx" ON "Client"("status");

CREATE TABLE "ClientAssignment" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "ClientRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientAssignment_pkey" PRIMARY KEY ("id")
);

-- One row per person per client; the role says whether they lead it, so someone
-- cannot be listed twice on the same client with conflicting roles.
CREATE UNIQUE INDEX "ClientAssignment_clientId_userId_key" ON "ClientAssignment"("clientId", "userId");
CREATE INDEX "ClientAssignment_clientId_idx" ON "ClientAssignment"("clientId");
CREATE INDEX "ClientAssignment_userId_idx" ON "ClientAssignment"("userId");

CREATE TABLE "ClientRosterRequest" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "note" TEXT,
    "status" "RosterRequestStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientRosterRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClientRosterRequest_clientId_idx" ON "ClientRosterRequest"("clientId");
CREATE INDEX "ClientRosterRequest_status_idx" ON "ClientRosterRequest"("status");
CREATE INDEX "ClientRosterRequest_requestedById_idx" ON "ClientRosterRequest"("requestedById");

CREATE TABLE "ClientRosterRequestItem" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "RosterRequestAction" NOT NULL,
    "role" "ClientRole",

    CONSTRAINT "ClientRosterRequestItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ClientRosterRequestItem_requestId_userId_action_key"
  ON "ClientRosterRequestItem"("requestId", "userId", "action");
CREATE INDEX "ClientRosterRequestItem_requestId_idx" ON "ClientRosterRequestItem"("requestId");
CREATE INDEX "ClientRosterRequestItem_userId_idx" ON "ClientRosterRequestItem"("userId");

ALTER TABLE "ClientAssignment" ADD CONSTRAINT "ClientAssignment_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientAssignment" ADD CONSTRAINT "ClientAssignment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientRosterRequest" ADD CONSTRAINT "ClientRosterRequest_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientRosterRequest" ADD CONSTRAINT "ClientRosterRequest_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- The request outlives the person who actioned it, so this nulls rather than cascades.
ALTER TABLE "ClientRosterRequest" ADD CONSTRAINT "ClientRosterRequest_resolvedById_fkey"
  FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClientRosterRequestItem" ADD CONSTRAINT "ClientRosterRequestItem_requestId_fkey"
  FOREIGN KEY ("requestId") REFERENCES "ClientRosterRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientRosterRequestItem" ADD CONSTRAINT "ClientRosterRequestItem_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
