CREATE TABLE "WfhRequest" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "requestTimezone" TEXT NOT NULL DEFAULT 'Asia/Karachi',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "workPlan" TEXT,
    "status" "LeaveStatus" NOT NULL DEFAULT 'PENDING',
    "leadApprovedBy" TEXT,
    "leadApprovedAt" TIMESTAMP(3),
    "leadComment" TEXT,
    "hrApprovedBy" TEXT,
    "hrApprovedAt" TIMESTAMP(3),
    "hrComment" TEXT,
    "rejectedBy" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WfhRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WfhRequest_employeeId_idx" ON "WfhRequest"("employeeId");
CREATE INDEX "WfhRequest_status_idx" ON "WfhRequest"("status");
CREATE INDEX "WfhRequest_startDate_endDate_idx" ON "WfhRequest"("startDate", "endDate");

ALTER TABLE "WfhRequest" ADD CONSTRAINT "WfhRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
