-- Catch-up for schema changes made on 2026-03-03 without a migration (avatar skin tone; keeping a person's name on
-- payroll and equipment records after the user is deleted). Production already has them, so every statement is
-- written to be a no-op where they exist: columns are added only if missing, and each foreign key is dropped if
-- present and re-created as the schema defines it (ON DELETE SET NULL).

-- DropForeignKey
ALTER TABLE "EquipmentAssignment" DROP CONSTRAINT IF EXISTS "EquipmentAssignment_assignedById_fkey";
ALTER TABLE "EquipmentAssignment" DROP CONSTRAINT IF EXISTS "EquipmentAssignment_employeeId_fkey";
ALTER TABLE "PayrollApprovalEvent" DROP CONSTRAINT IF EXISTS "PayrollApprovalEvent_actorId_fkey";
ALTER TABLE "PayrollExpenseEntry" DROP CONSTRAINT IF EXISTS "PayrollExpenseEntry_enteredById_fkey";
ALTER TABLE "PayrollImportBatch" DROP CONSTRAINT IF EXISTS "PayrollImportBatch_importedById_fkey";
ALTER TABLE "PayrollInputAuditEvent" DROP CONSTRAINT IF EXISTS "PayrollInputAuditEvent_actorId_fkey";
ALTER TABLE "PayrollPeriod" DROP CONSTRAINT IF EXISTS "PayrollPeriod_createdById_fkey";
ALTER TABLE "PayrollSalaryRevision" DROP CONSTRAINT IF EXISTS "PayrollSalaryRevision_createdById_fkey";

-- AlterTable
ALTER TABLE "EquipmentAssignment" ADD COLUMN IF NOT EXISTS "assignedByName" TEXT,
ADD COLUMN IF NOT EXISTS "employeeName" TEXT,
ALTER COLUMN "employeeId" DROP NOT NULL,
ALTER COLUMN "assignedById" DROP NOT NULL;

ALTER TABLE "PayrollApprovalEvent" ADD COLUMN IF NOT EXISTS "actorName" TEXT,
ALTER COLUMN "actorId" DROP NOT NULL;

ALTER TABLE "PayrollExpenseEntry" ADD COLUMN IF NOT EXISTS "enteredByName" TEXT,
ALTER COLUMN "enteredById" DROP NOT NULL;

ALTER TABLE "PayrollImportBatch" ADD COLUMN IF NOT EXISTS "importedByName" TEXT,
ALTER COLUMN "importedById" DROP NOT NULL;

ALTER TABLE "PayrollInputAuditEvent" ADD COLUMN IF NOT EXISTS "actorName" TEXT,
ALTER COLUMN "actorId" DROP NOT NULL;

ALTER TABLE "PayrollPeriod" ADD COLUMN IF NOT EXISTS "createdByName" TEXT,
ALTER COLUMN "createdById" DROP NOT NULL;

ALTER TABLE "PayrollSalaryRevision" ADD COLUMN IF NOT EXISTS "createdByName" TEXT,
ALTER COLUMN "createdById" DROP NOT NULL;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "avatarSkinTone" TEXT;

-- AddForeignKey
ALTER TABLE "EquipmentAssignment" ADD CONSTRAINT "EquipmentAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EquipmentAssignment" ADD CONSTRAINT "EquipmentAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayrollSalaryRevision" ADD CONSTRAINT "PayrollSalaryRevision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayrollInputAuditEvent" ADD CONSTRAINT "PayrollInputAuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayrollImportBatch" ADD CONSTRAINT "PayrollImportBatch_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayrollExpenseEntry" ADD CONSTRAINT "PayrollExpenseEntry_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayrollApprovalEvent" ADD CONSTRAINT "PayrollApprovalEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
