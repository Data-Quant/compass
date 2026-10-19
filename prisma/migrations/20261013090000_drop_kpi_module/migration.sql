-- The KPI module is removed: its tables, data and enums go with it.

-- DropForeignKey
ALTER TABLE "KpiGoal" DROP CONSTRAINT "KpiGoal_kpiMonthId_fkey";

-- DropForeignKey
ALTER TABLE "Kpi" DROP CONSTRAINT "Kpi_goalId_fkey";

-- DropForeignKey
ALTER TABLE "KpiComment" DROP CONSTRAINT "KpiComment_kpiId_fkey";

-- DropForeignKey
ALTER TABLE "KpiAssignee" DROP CONSTRAINT "KpiAssignee_kpiId_fkey";

-- DropForeignKey
ALTER TABLE "KpiEvidenceFile" DROP CONSTRAINT "KpiEvidenceFile_kpiId_fkey";

-- DropForeignKey
ALTER TABLE "KpiChangeRequest" DROP CONSTRAINT "KpiChangeRequest_kpiId_fkey";

-- DropTable
DROP TABLE "KpiMonth";

-- DropTable
DROP TABLE "KpiGoal";

-- DropTable
DROP TABLE "Kpi";

-- DropTable
DROP TABLE "KpiComment";

-- DropTable
DROP TABLE "KpiAssignee";

-- DropTable
DROP TABLE "KpiEvidenceFile";

-- DropTable
DROP TABLE "KpiChangeRequest";

-- DropTable
DROP TABLE "KpiSetterAssignment";

-- DropTable
DROP TABLE "KpiRoleGrant";

-- DropTable
DROP TABLE "KpiEvent";

-- DropTable
DROP TABLE "KpiNotification";

-- DropEnum
DROP TYPE "KpiScope";

-- DropEnum
DROP TYPE "KpiEvidenceType";

-- DropEnum
DROP TYPE "KpiStatus";

-- DropEnum
DROP TYPE "KpiGrantRole";

-- DropEnum
DROP TYPE "KpiChangeStatus";

