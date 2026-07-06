-- CreateEnum
CREATE TYPE "LeaveTransitionPlanLeadStatus" AS ENUM ('PENDING', 'APPROVED', 'DISAPPROVED');

-- AlterEnum (new leave audit event types)
ALTER TYPE "LeaveAuditEventType" ADD VALUE IF NOT EXISTS 'TRANSITION_PLAN_SUBMITTED';
ALTER TYPE "LeaveAuditEventType" ADD VALUE IF NOT EXISTS 'TRANSITION_PLAN_DISAPPROVED';
ALTER TYPE "LeaveAuditEventType" ADD VALUE IF NOT EXISTS 'TRANSITION_PLAN_ESCALATION';

-- AlterTable
ALTER TABLE "LeaveRequest"
  ADD COLUMN "transitionPlanTasks" JSONB,
  ADD COLUMN "transitionPlanSubmittedAt" TIMESTAMP(3),
  ADD COLUMN "transitionPlanLeadStatus" "LeaveTransitionPlanLeadStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "transitionPlanLeadReviewedAt" TIMESTAMP(3),
  ADD COLUMN "transitionPlanLeadReviewedById" TEXT,
  ADD COLUMN "transitionPlanDisapprovalReason" TEXT,
  ADD COLUMN "hrRepresentative" TEXT;
