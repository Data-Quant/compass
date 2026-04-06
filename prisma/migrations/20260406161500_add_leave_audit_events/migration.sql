CREATE TYPE "LeaveAuditChannel" AS ENUM ('EMAIL', 'CALENDAR');
CREATE TYPE "LeaveAuditEventType" AS ENUM (
  'REQUEST_NOTIFICATION',
  'APPROVAL_NOTIFICATION',
  'TRANSITION_PLAN_REMINDER',
  'CALENDAR_SYNC',
  'CALENDAR_REMOVE'
);
CREATE TYPE "LeaveAuditStatus" AS ENUM ('SUCCESS', 'FAILED', 'SKIPPED');

CREATE TABLE "LeaveAuditEvent" (
  "id" TEXT NOT NULL,
  "leaveRequestId" TEXT NOT NULL,
  "actorId" TEXT,
  "channel" "LeaveAuditChannel" NOT NULL,
  "eventType" "LeaveAuditEventType" NOT NULL,
  "status" "LeaveAuditStatus" NOT NULL,
  "recipients" JSONB,
  "subject" TEXT,
  "providerMessageId" TEXT,
  "metadata" JSONB,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LeaveAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LeaveAuditEvent_leaveRequestId_createdAt_idx" ON "LeaveAuditEvent"("leaveRequestId", "createdAt");
CREATE INDEX "LeaveAuditEvent_eventType_createdAt_idx" ON "LeaveAuditEvent"("eventType", "createdAt");
CREATE INDEX "LeaveAuditEvent_status_createdAt_idx" ON "LeaveAuditEvent"("status", "createdAt");
CREATE INDEX "LeaveAuditEvent_actorId_idx" ON "LeaveAuditEvent"("actorId");

ALTER TABLE "LeaveAuditEvent"
ADD CONSTRAINT "LeaveAuditEvent_leaveRequestId_fkey"
FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeaveAuditEvent"
ADD CONSTRAINT "LeaveAuditEvent_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
