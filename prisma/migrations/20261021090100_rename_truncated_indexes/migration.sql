-- Three index names created by earlier migrations, cut at Postgres's 63-character limit, differ from the names the
-- schema now expects. Renaming changes nothing else; IF EXISTS keeps it a no-op on a database that already has them.

-- RenameIndex
ALTER INDEX IF EXISTS "EvaluationPeriodAssignmentOverride_periodId_evaluatorId_eval_ke" RENAME TO "EvaluationPeriodAssignmentOverride_periodId_evaluatorId_eva_key";

-- RenameIndex
ALTER INDEX IF EXISTS "EvaluationPeriodAssignmentSnapshot_periodId_evaluatorId_evaluat" RENAME TO "EvaluationPeriodAssignmentSnapshot_periodId_evaluatorId_eva_key";

-- RenameIndex
ALTER INDEX IF EXISTS "ProjectNotificationDigestItem_recipientId_sentAt_skippedAt_crea" RENAME TO "ProjectNotificationDigestItem_recipientId_sentAt_skippedAt__idx";
