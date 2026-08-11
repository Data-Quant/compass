-- The transition-plan deadline ladder for leaves longer than two working days.
--
-- These rows are not only an audit trail. TRANSITION_PLAN_NOTICE is the record the
-- cancellation deadline is derived from: deadline = min(notice + 2 days, start - 1).
-- A leave with no successful notice row therefore has no deadline and can never be
-- auto-cancelled, which is what stops a failed send from cancelling someone's leave.
ALTER TYPE "LeaveAuditEventType" ADD VALUE IF NOT EXISTS 'TRANSITION_PLAN_NOTICE';
ALTER TYPE "LeaveAuditEventType" ADD VALUE IF NOT EXISTS 'TRANSITION_PLAN_FINAL_WARNING';
ALTER TYPE "LeaveAuditEventType" ADD VALUE IF NOT EXISTS 'TRANSITION_PLAN_AUTO_CANCELLED';

-- The cancellation itself sends no message of its own (the existing cancellation
-- email covers that), so it needs a channel that is neither EMAIL nor CALENDAR.
ALTER TYPE "LeaveAuditChannel" ADD VALUE IF NOT EXISTS 'SYSTEM';
