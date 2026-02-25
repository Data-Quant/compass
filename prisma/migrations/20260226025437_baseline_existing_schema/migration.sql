-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('EMPLOYEE', 'HR', 'SECURITY', 'OA');

-- CreateEnum
CREATE TYPE "RelationshipType" AS ENUM ('DIRECT_REPORT', 'TEAM_LEAD', 'PEER', 'C_LEVEL', 'HR', 'DEPT', 'SELF');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('RATING', 'TEXT');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "LeaveType" AS ENUM ('CASUAL', 'SICK', 'ANNUAL');

-- CreateEnum
CREATE TYPE "LeaveStatus" AS ENUM ('PENDING', 'LEAD_APPROVED', 'HR_APPROVED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HalfDaySession" AS ENUM ('FIRST_HALF', 'SECOND_HALF');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'SOLUTION', 'RESOLVED');

-- CreateEnum
CREATE TYPE "TicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('IN_STOCK', 'ASSIGNED', 'IN_REPAIR', 'RETIRED', 'LOST', 'DISPOSED');

-- CreateEnum
CREATE TYPE "AssetCondition" AS ENUM ('NEW', 'GOOD', 'FAIR', 'DAMAGED');

-- CreateEnum
CREATE TYPE "TransportMode" AS ENUM ('CAR', 'BIKE', 'PUBLIC_TRANSPORT');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'PUBLIC_HOLIDAY');

-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('MANUAL', 'IMPORT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "SalaryHeadType" AS ENUM ('EARNING', 'DEDUCTION');

-- CreateEnum
CREATE TYPE "PayrollPeriodStatus" AS ENUM ('DRAFT', 'CALCULATED', 'APPROVED', 'SENDING', 'SENT', 'PARTIAL', 'FAILED', 'LOCKED');

-- CreateEnum
CREATE TYPE "PayrollSourceType" AS ENUM ('WORKBOOK', 'MANUAL', 'CARRY_FORWARD');

-- CreateEnum
CREATE TYPE "PayrollIdentityStatus" AS ENUM ('AUTO_MATCHED', 'MANUAL_MATCHED', 'UNRESOLVED', 'AMBIGUOUS');

-- CreateEnum
CREATE TYPE "PayrollReceiptStatus" AS ENUM ('DRAFT', 'READY', 'ENVELOPE_CREATED', 'SENT', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "PayrollImportStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "discordId" TEXT,
    "passwordHash" TEXT,
    "passwordVersion" INTEGER NOT NULL DEFAULT 0,
    "department" TEXT,
    "position" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'EMPLOYEE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "chartX" DOUBLE PRECISION,
    "chartY" DOUBLE PRECISION,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluatorMapping" (
    "id" TEXT NOT NULL,
    "evaluatorId" TEXT NOT NULL,
    "evaluateeId" TEXT NOT NULL,
    "relationshipType" "RelationshipType" NOT NULL,
    "isSelfEvaluation" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvaluatorMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationQuestion" (
    "id" TEXT NOT NULL,
    "relationshipType" "RelationshipType" NOT NULL,
    "questionText" TEXT NOT NULL,
    "questionType" "QuestionType" NOT NULL DEFAULT 'RATING',
    "maxRating" INTEGER NOT NULL DEFAULT 4,
    "orderIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluationQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvaluationPeriod" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "reminderSent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvaluationPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evaluation" (
    "id" TEXT NOT NULL,
    "evaluatorId" TEXT NOT NULL,
    "evaluateeId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "ratingValue" INTEGER,
    "textResponse" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Evaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Weightage" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "relationshipType" "RelationshipType" NOT NULL,
    "weightagePercentage" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Weightage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "breakdownJson" JSONB NOT NULL,
    "isAnonymized" BOOLEAN NOT NULL DEFAULT false,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailQueue" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "reportId" TEXT,
    "emailStatus" "EmailStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveType" "LeaveType" NOT NULL,
    "isHalfDay" BOOLEAN NOT NULL DEFAULT false,
    "halfDaySession" "HalfDaySession",
    "unavailableStartTime" TEXT,
    "unavailableEndTime" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "transitionPlan" TEXT NOT NULL,
    "coverPersonId" TEXT,
    "additionalNotifyIds" JSONB,
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

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveBalance" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "casualDays" INTEGER NOT NULL DEFAULT 10,
    "sickDays" INTEGER NOT NULL DEFAULT 6,
    "annualDays" INTEGER NOT NULL DEFAULT 14,
    "casualUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sickUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "annualUsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeightProfile" (
    "id" TEXT NOT NULL,
    "categorySetKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "weights" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeightProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceTicket" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "deviceType" TEXT NOT NULL,
    "isUpgradeRequest" BOOLEAN NOT NULL DEFAULT false,
    "managerApprovalReceived" BOOLEAN,
    "priority" "TicketPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "hrAssignedTo" TEXT,
    "solution" TEXT,
    "expectedResolutionDate" TIMESTAMP(3),
    "hrNotes" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentAsset" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "assetName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "specsJson" JSONB,
    "purchaseCost" DOUBLE PRECISION,
    "purchaseCurrency" TEXT NOT NULL DEFAULT 'PKR',
    "purchaseDate" TIMESTAMP(3),
    "warrantyStartDate" TIMESTAMP(3),
    "warrantyEndDate" TIMESTAMP(3),
    "vendor" TEXT,
    "status" "AssetStatus" NOT NULL DEFAULT 'IN_STOCK',
    "condition" "AssetCondition" NOT NULL DEFAULT 'GOOD',
    "location" TEXT,
    "notes" TEXT,
    "currentAssigneeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentAssignment" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassignedAt" TIMESTAMP(3),
    "unassignedById" TEXT,
    "assignmentNote" TEXT,
    "returnNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentEvent" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "actorId" TEXT,
    "eventType" TEXT NOT NULL,
    "payloadJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquipmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollDepartment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollDepartment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollEmploymentType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollEmploymentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollEmployeeProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "departmentId" TEXT,
    "designation" TEXT,
    "officialEmail" TEXT,
    "cnicNumber" TEXT,
    "employmentTypeId" TEXT,
    "joiningDate" TIMESTAMP(3),
    "exitDate" TIMESTAMP(3),
    "isPayrollActive" BOOLEAN NOT NULL DEFAULT true,
    "distanceKm" DOUBLE PRECISION,
    "transportMode" "TransportMode",
    "bankName" TEXT,
    "accountTitle" TEXT,
    "accountNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollEmployeeProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollSalaryHead" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SalaryHeadType" NOT NULL,
    "isTaxable" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollSalaryHead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollSalaryRevision" (
    "id" TEXT NOT NULL,
    "employeeProfileId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollSalaryRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollSalaryRevisionLine" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "salaryHeadId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollSalaryRevisionLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollTravelAllowanceTier" (
    "id" TEXT NOT NULL,
    "transportMode" "TransportMode" NOT NULL,
    "minKm" DOUBLE PRECISION NOT NULL,
    "maxKm" DOUBLE PRECISION,
    "monthlyRate" DOUBLE PRECISION NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollTravelAllowanceTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollFinancialYear" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollFinancialYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollTaxBracket" (
    "id" TEXT NOT NULL,
    "financialYearId" TEXT NOT NULL,
    "incomeFrom" DOUBLE PRECISION NOT NULL,
    "incomeTo" DOUBLE PRECISION,
    "fixedTax" DOUBLE PRECISION NOT NULL,
    "taxRate" DOUBLE PRECISION NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollTaxBracket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollPublicHoliday" (
    "id" TEXT NOT NULL,
    "holidayDate" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "financialYearId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollPublicHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollAttendanceEntry" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "attendanceDate" TIMESTAMP(3) NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "source" "AttendanceSource" NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollAttendanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollInputAuditEvent" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "userId" TEXT,
    "payrollName" TEXT NOT NULL,
    "componentKey" TEXT NOT NULL,
    "previousAmount" DOUBLE PRECISION,
    "newAmount" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollInputAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollPeriod" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "PayrollPeriodStatus" NOT NULL DEFAULT 'DRAFT',
    "sourceType" "PayrollSourceType" NOT NULL DEFAULT 'CARRY_FORWARD',
    "currency" TEXT NOT NULL DEFAULT 'PKR',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Karachi',
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "summaryJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollIdentityMapping" (
    "id" TEXT NOT NULL,
    "normalizedPayrollName" TEXT NOT NULL,
    "displayPayrollName" TEXT NOT NULL,
    "userId" TEXT,
    "status" "PayrollIdentityStatus" NOT NULL DEFAULT 'UNRESOLVED',
    "lastMatchedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollIdentityMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollImportBatch" (
    "id" TEXT NOT NULL,
    "sourceType" "PayrollSourceType" NOT NULL,
    "fileName" TEXT,
    "importedById" TEXT NOT NULL,
    "periodId" TEXT,
    "status" "PayrollImportStatus" NOT NULL DEFAULT 'PENDING',
    "summaryJson" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollImportRow" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "sheetName" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "rowJson" JSONB NOT NULL,
    "periodKey" TEXT,
    "payrollName" TEXT,
    "normalizedName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollInputValue" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "payrollName" TEXT NOT NULL,
    "userId" TEXT,
    "componentKey" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "sourceSheet" TEXT,
    "sourceCell" TEXT,
    "sourceMethod" "PayrollSourceType" NOT NULL DEFAULT 'MANUAL',
    "isOverride" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "provenanceJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollInputValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollComputedValue" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "payrollName" TEXT NOT NULL,
    "userId" TEXT,
    "metricKey" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "formulaKey" TEXT NOT NULL,
    "formulaVersion" TEXT NOT NULL,
    "lineageJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollComputedValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollExpenseEntry" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "userId" TEXT,
    "payrollName" TEXT,
    "categoryKey" TEXT NOT NULL,
    "description" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "sheetName" TEXT,
    "rowRef" TEXT,
    "enteredById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollExpenseEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollReceipt" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "userId" TEXT,
    "payrollName" TEXT NOT NULL,
    "receiptJson" JSONB NOT NULL,
    "renderedHtml" TEXT,
    "status" "PayrollReceiptStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollDocuSignEnvelope" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "envelopeId" TEXT,
    "recipientName" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollDocuSignEnvelope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollApprovalEvent" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "fromStatus" "PayrollPeriodStatus",
    "toStatus" "PayrollPeriodStatus" NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollApprovalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollConfig" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateRoleName" TEXT NOT NULL DEFAULT 'Employee',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sectionId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'TODO',
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "assigneeId" TEXT,
    "startDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskSection" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskComment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskLabel" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',

    CONSTRAINT "TaskLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectReference" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskLabelAssignment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,

    CONSTRAINT "TaskLabelAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_name_idx" ON "User"("name");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "EvaluatorMapping_evaluatorId_idx" ON "EvaluatorMapping"("evaluatorId");

-- CreateIndex
CREATE INDEX "EvaluatorMapping_evaluateeId_idx" ON "EvaluatorMapping"("evaluateeId");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluatorMapping_evaluatorId_evaluateeId_relationshipType_key" ON "EvaluatorMapping"("evaluatorId", "evaluateeId", "relationshipType");

-- CreateIndex
CREATE INDEX "EvaluationQuestion_relationshipType_orderIndex_idx" ON "EvaluationQuestion"("relationshipType", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "EvaluationQuestion_relationshipType_orderIndex_key" ON "EvaluationQuestion"("relationshipType", "orderIndex");

-- CreateIndex
CREATE INDEX "EvaluationPeriod_isActive_idx" ON "EvaluationPeriod"("isActive");

-- CreateIndex
CREATE INDEX "Evaluation_evaluatorId_idx" ON "Evaluation"("evaluatorId");

-- CreateIndex
CREATE INDEX "Evaluation_evaluateeId_idx" ON "Evaluation"("evaluateeId");

-- CreateIndex
CREATE INDEX "Evaluation_periodId_idx" ON "Evaluation"("periodId");

-- CreateIndex
CREATE UNIQUE INDEX "Evaluation_evaluatorId_evaluateeId_questionId_periodId_key" ON "Evaluation"("evaluatorId", "evaluateeId", "questionId", "periodId");

-- CreateIndex
CREATE INDEX "Weightage_employeeId_idx" ON "Weightage"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Weightage_employeeId_relationshipType_key" ON "Weightage"("employeeId", "relationshipType");

-- CreateIndex
CREATE INDEX "Report_employeeId_idx" ON "Report"("employeeId");

-- CreateIndex
CREATE INDEX "Report_periodId_idx" ON "Report"("periodId");

-- CreateIndex
CREATE UNIQUE INDEX "Report_employeeId_periodId_key" ON "Report"("employeeId", "periodId");

-- CreateIndex
CREATE INDEX "EmailQueue_emailStatus_idx" ON "EmailQueue"("emailStatus");

-- CreateIndex
CREATE INDEX "EmailQueue_employeeId_idx" ON "EmailQueue"("employeeId");

-- CreateIndex
CREATE INDEX "LeaveRequest_employeeId_idx" ON "LeaveRequest"("employeeId");

-- CreateIndex
CREATE INDEX "LeaveRequest_status_idx" ON "LeaveRequest"("status");

-- CreateIndex
CREATE INDEX "LeaveRequest_startDate_endDate_idx" ON "LeaveRequest"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "LeaveBalance_employeeId_idx" ON "LeaveBalance"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveBalance_employeeId_year_key" ON "LeaveBalance"("employeeId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "WeightProfile_categorySetKey_key" ON "WeightProfile"("categorySetKey");

-- CreateIndex
CREATE INDEX "DeviceTicket_employeeId_idx" ON "DeviceTicket"("employeeId");

-- CreateIndex
CREATE INDEX "DeviceTicket_status_idx" ON "DeviceTicket"("status");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentAsset_equipmentId_key" ON "EquipmentAsset"("equipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentAsset_serialNumber_key" ON "EquipmentAsset"("serialNumber");

-- CreateIndex
CREATE INDEX "EquipmentAsset_equipmentId_idx" ON "EquipmentAsset"("equipmentId");

-- CreateIndex
CREATE INDEX "EquipmentAsset_serialNumber_idx" ON "EquipmentAsset"("serialNumber");

-- CreateIndex
CREATE INDEX "EquipmentAsset_status_idx" ON "EquipmentAsset"("status");

-- CreateIndex
CREATE INDEX "EquipmentAsset_currentAssigneeId_idx" ON "EquipmentAsset"("currentAssigneeId");

-- CreateIndex
CREATE INDEX "EquipmentAsset_warrantyEndDate_idx" ON "EquipmentAsset"("warrantyEndDate");

-- CreateIndex
CREATE INDEX "EquipmentAssignment_assetId_idx" ON "EquipmentAssignment"("assetId");

-- CreateIndex
CREATE INDEX "EquipmentAssignment_employeeId_idx" ON "EquipmentAssignment"("employeeId");

-- CreateIndex
CREATE INDEX "EquipmentAssignment_assignedAt_idx" ON "EquipmentAssignment"("assignedAt");

-- CreateIndex
CREATE INDEX "EquipmentAssignment_unassignedAt_idx" ON "EquipmentAssignment"("unassignedAt");

-- CreateIndex
CREATE INDEX "EquipmentEvent_assetId_idx" ON "EquipmentEvent"("assetId");

-- CreateIndex
CREATE INDEX "EquipmentEvent_eventType_idx" ON "EquipmentEvent"("eventType");

-- CreateIndex
CREATE INDEX "EquipmentEvent_createdAt_idx" ON "EquipmentEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollDepartment_name_key" ON "PayrollDepartment"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollEmploymentType_name_key" ON "PayrollEmploymentType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollEmployeeProfile_userId_key" ON "PayrollEmployeeProfile"("userId");

-- CreateIndex
CREATE INDEX "PayrollEmployeeProfile_isPayrollActive_idx" ON "PayrollEmployeeProfile"("isPayrollActive");

-- CreateIndex
CREATE INDEX "PayrollEmployeeProfile_departmentId_idx" ON "PayrollEmployeeProfile"("departmentId");

-- CreateIndex
CREATE INDEX "PayrollEmployeeProfile_employmentTypeId_idx" ON "PayrollEmployeeProfile"("employmentTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollSalaryHead_code_key" ON "PayrollSalaryHead"("code");

-- CreateIndex
CREATE INDEX "PayrollSalaryHead_isActive_idx" ON "PayrollSalaryHead"("isActive");

-- CreateIndex
CREATE INDEX "PayrollSalaryHead_type_idx" ON "PayrollSalaryHead"("type");

-- CreateIndex
CREATE INDEX "PayrollSalaryRevision_employeeProfileId_effectiveFrom_idx" ON "PayrollSalaryRevision"("employeeProfileId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "PayrollSalaryRevision_createdById_idx" ON "PayrollSalaryRevision"("createdById");

-- CreateIndex
CREATE INDEX "PayrollSalaryRevisionLine_salaryHeadId_idx" ON "PayrollSalaryRevisionLine"("salaryHeadId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollSalaryRevisionLine_revisionId_salaryHeadId_key" ON "PayrollSalaryRevisionLine"("revisionId", "salaryHeadId");

-- CreateIndex
CREATE INDEX "PayrollTravelAllowanceTier_transportMode_minKm_maxKm_idx" ON "PayrollTravelAllowanceTier"("transportMode", "minKm", "maxKm");

-- CreateIndex
CREATE INDEX "PayrollTravelAllowanceTier_effectiveFrom_effectiveTo_idx" ON "PayrollTravelAllowanceTier"("effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "PayrollTravelAllowanceTier_isActive_idx" ON "PayrollTravelAllowanceTier"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollFinancialYear_label_key" ON "PayrollFinancialYear"("label");

-- CreateIndex
CREATE INDEX "PayrollFinancialYear_isActive_idx" ON "PayrollFinancialYear"("isActive");

-- CreateIndex
CREATE INDEX "PayrollFinancialYear_startDate_endDate_idx" ON "PayrollFinancialYear"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "PayrollTaxBracket_financialYearId_incomeFrom_incomeTo_idx" ON "PayrollTaxBracket"("financialYearId", "incomeFrom", "incomeTo");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollTaxBracket_financialYearId_orderIndex_key" ON "PayrollTaxBracket"("financialYearId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPublicHoliday_holidayDate_key" ON "PayrollPublicHoliday"("holidayDate");

-- CreateIndex
CREATE INDEX "PayrollPublicHoliday_holidayDate_idx" ON "PayrollPublicHoliday"("holidayDate");

-- CreateIndex
CREATE INDEX "PayrollPublicHoliday_financialYearId_idx" ON "PayrollPublicHoliday"("financialYearId");

-- CreateIndex
CREATE INDEX "PayrollAttendanceEntry_periodId_userId_idx" ON "PayrollAttendanceEntry"("periodId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollAttendanceEntry_userId_attendanceDate_key" ON "PayrollAttendanceEntry"("userId", "attendanceDate");

-- CreateIndex
CREATE INDEX "PayrollInputAuditEvent_periodId_idx" ON "PayrollInputAuditEvent"("periodId");

-- CreateIndex
CREATE INDEX "PayrollInputAuditEvent_userId_idx" ON "PayrollInputAuditEvent"("userId");

-- CreateIndex
CREATE INDEX "PayrollInputAuditEvent_payrollName_componentKey_idx" ON "PayrollInputAuditEvent"("payrollName", "componentKey");

-- CreateIndex
CREATE INDEX "PayrollPeriod_status_idx" ON "PayrollPeriod"("status");

-- CreateIndex
CREATE INDEX "PayrollPeriod_periodStart_periodEnd_idx" ON "PayrollPeriod"("periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "PayrollPeriod_createdById_idx" ON "PayrollPeriod"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollIdentityMapping_normalizedPayrollName_key" ON "PayrollIdentityMapping"("normalizedPayrollName");

-- CreateIndex
CREATE INDEX "PayrollIdentityMapping_status_idx" ON "PayrollIdentityMapping"("status");

-- CreateIndex
CREATE INDEX "PayrollIdentityMapping_userId_idx" ON "PayrollIdentityMapping"("userId");

-- CreateIndex
CREATE INDEX "PayrollImportBatch_sourceType_idx" ON "PayrollImportBatch"("sourceType");

-- CreateIndex
CREATE INDEX "PayrollImportBatch_status_idx" ON "PayrollImportBatch"("status");

-- CreateIndex
CREATE INDEX "PayrollImportBatch_importedById_idx" ON "PayrollImportBatch"("importedById");

-- CreateIndex
CREATE INDEX "PayrollImportBatch_periodId_idx" ON "PayrollImportBatch"("periodId");

-- CreateIndex
CREATE INDEX "PayrollImportRow_batchId_idx" ON "PayrollImportRow"("batchId");

-- CreateIndex
CREATE INDEX "PayrollImportRow_sheetName_idx" ON "PayrollImportRow"("sheetName");

-- CreateIndex
CREATE INDEX "PayrollImportRow_periodKey_idx" ON "PayrollImportRow"("periodKey");

-- CreateIndex
CREATE INDEX "PayrollImportRow_normalizedName_idx" ON "PayrollImportRow"("normalizedName");

-- CreateIndex
CREATE INDEX "PayrollInputValue_periodId_idx" ON "PayrollInputValue"("periodId");

-- CreateIndex
CREATE INDEX "PayrollInputValue_userId_idx" ON "PayrollInputValue"("userId");

-- CreateIndex
CREATE INDEX "PayrollInputValue_componentKey_idx" ON "PayrollInputValue"("componentKey");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollInputValue_periodId_payrollName_componentKey_key" ON "PayrollInputValue"("periodId", "payrollName", "componentKey");

-- CreateIndex
CREATE INDEX "PayrollComputedValue_periodId_idx" ON "PayrollComputedValue"("periodId");

-- CreateIndex
CREATE INDEX "PayrollComputedValue_metricKey_idx" ON "PayrollComputedValue"("metricKey");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollComputedValue_periodId_payrollName_metricKey_key" ON "PayrollComputedValue"("periodId", "payrollName", "metricKey");

-- CreateIndex
CREATE INDEX "PayrollExpenseEntry_periodId_idx" ON "PayrollExpenseEntry"("periodId");

-- CreateIndex
CREATE INDEX "PayrollExpenseEntry_enteredById_idx" ON "PayrollExpenseEntry"("enteredById");

-- CreateIndex
CREATE INDEX "PayrollExpenseEntry_categoryKey_idx" ON "PayrollExpenseEntry"("categoryKey");

-- CreateIndex
CREATE INDEX "PayrollReceipt_periodId_idx" ON "PayrollReceipt"("periodId");

-- CreateIndex
CREATE INDEX "PayrollReceipt_userId_idx" ON "PayrollReceipt"("userId");

-- CreateIndex
CREATE INDEX "PayrollReceipt_status_idx" ON "PayrollReceipt"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollReceipt_periodId_payrollName_key" ON "PayrollReceipt"("periodId", "payrollName");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollDocuSignEnvelope_envelopeId_key" ON "PayrollDocuSignEnvelope"("envelopeId");

-- CreateIndex
CREATE INDEX "PayrollDocuSignEnvelope_receiptId_idx" ON "PayrollDocuSignEnvelope"("receiptId");

-- CreateIndex
CREATE INDEX "PayrollDocuSignEnvelope_status_idx" ON "PayrollDocuSignEnvelope"("status");

-- CreateIndex
CREATE INDEX "PayrollApprovalEvent_periodId_idx" ON "PayrollApprovalEvent"("periodId");

-- CreateIndex
CREATE INDEX "PayrollApprovalEvent_actorId_idx" ON "PayrollApprovalEvent"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollConfig_active_key" ON "PayrollConfig"("active");

-- CreateIndex
CREATE INDEX "Project_ownerId_idx" ON "Project"("ownerId");

-- CreateIndex
CREATE INDEX "Project_status_idx" ON "Project"("status");

-- CreateIndex
CREATE INDEX "ProjectMember_projectId_idx" ON "ProjectMember"("projectId");

-- CreateIndex
CREATE INDEX "ProjectMember_userId_idx" ON "ProjectMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");

-- CreateIndex
CREATE INDEX "Task_projectId_idx" ON "Task"("projectId");

-- CreateIndex
CREATE INDEX "Task_sectionId_idx" ON "Task"("sectionId");

-- CreateIndex
CREATE INDEX "Task_assigneeId_idx" ON "Task"("assigneeId");

-- CreateIndex
CREATE INDEX "Task_assigneeId_dueDate_idx" ON "Task"("assigneeId", "dueDate");

-- CreateIndex
CREATE INDEX "Task_status_idx" ON "Task"("status");

-- CreateIndex
CREATE INDEX "TaskSection_projectId_idx" ON "TaskSection"("projectId");

-- CreateIndex
CREATE INDEX "TaskComment_taskId_idx" ON "TaskComment"("taskId");

-- CreateIndex
CREATE INDEX "TaskComment_authorId_idx" ON "TaskComment"("authorId");

-- CreateIndex
CREATE INDEX "TaskLabel_projectId_idx" ON "TaskLabel"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskLabel_projectId_name_key" ON "TaskLabel"("projectId", "name");

-- CreateIndex
CREATE INDEX "ProjectReference_projectId_idx" ON "ProjectReference"("projectId");

-- CreateIndex
CREATE INDEX "ProjectReference_createdById_idx" ON "ProjectReference"("createdById");

-- CreateIndex
CREATE INDEX "ProjectReference_updatedAt_idx" ON "ProjectReference"("updatedAt");

-- CreateIndex
CREATE INDEX "TaskLabelAssignment_taskId_idx" ON "TaskLabelAssignment"("taskId");

-- CreateIndex
CREATE INDEX "TaskLabelAssignment_labelId_idx" ON "TaskLabelAssignment"("labelId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskLabelAssignment_taskId_labelId_key" ON "TaskLabelAssignment"("taskId", "labelId");

-- AddForeignKey
ALTER TABLE "EvaluatorMapping" ADD CONSTRAINT "EvaluatorMapping_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvaluatorMapping" ADD CONSTRAINT "EvaluatorMapping_evaluateeId_fkey" FOREIGN KEY ("evaluateeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "EvaluationQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluation" ADD CONSTRAINT "Evaluation_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "EvaluationPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Weightage" ADD CONSTRAINT "Weightage_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "EvaluationPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailQueue" ADD CONSTRAINT "EmailQueue_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailQueue" ADD CONSTRAINT "EmailQueue_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_coverPersonId_fkey" FOREIGN KEY ("coverPersonId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceTicket" ADD CONSTRAINT "DeviceTicket_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentAsset" ADD CONSTRAINT "EquipmentAsset_currentAssigneeId_fkey" FOREIGN KEY ("currentAssigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentAssignment" ADD CONSTRAINT "EquipmentAssignment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "EquipmentAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentAssignment" ADD CONSTRAINT "EquipmentAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentAssignment" ADD CONSTRAINT "EquipmentAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentAssignment" ADD CONSTRAINT "EquipmentAssignment_unassignedById_fkey" FOREIGN KEY ("unassignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentEvent" ADD CONSTRAINT "EquipmentEvent_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "EquipmentAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentEvent" ADD CONSTRAINT "EquipmentEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollEmployeeProfile" ADD CONSTRAINT "PayrollEmployeeProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollEmployeeProfile" ADD CONSTRAINT "PayrollEmployeeProfile_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "PayrollDepartment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollEmployeeProfile" ADD CONSTRAINT "PayrollEmployeeProfile_employmentTypeId_fkey" FOREIGN KEY ("employmentTypeId") REFERENCES "PayrollEmploymentType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollSalaryRevision" ADD CONSTRAINT "PayrollSalaryRevision_employeeProfileId_fkey" FOREIGN KEY ("employeeProfileId") REFERENCES "PayrollEmployeeProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollSalaryRevision" ADD CONSTRAINT "PayrollSalaryRevision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollSalaryRevisionLine" ADD CONSTRAINT "PayrollSalaryRevisionLine_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "PayrollSalaryRevision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollSalaryRevisionLine" ADD CONSTRAINT "PayrollSalaryRevisionLine_salaryHeadId_fkey" FOREIGN KEY ("salaryHeadId") REFERENCES "PayrollSalaryHead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollTaxBracket" ADD CONSTRAINT "PayrollTaxBracket_financialYearId_fkey" FOREIGN KEY ("financialYearId") REFERENCES "PayrollFinancialYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPublicHoliday" ADD CONSTRAINT "PayrollPublicHoliday_financialYearId_fkey" FOREIGN KEY ("financialYearId") REFERENCES "PayrollFinancialYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAttendanceEntry" ADD CONSTRAINT "PayrollAttendanceEntry_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAttendanceEntry" ADD CONSTRAINT "PayrollAttendanceEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAttendanceEntry" ADD CONSTRAINT "PayrollAttendanceEntry_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollInputAuditEvent" ADD CONSTRAINT "PayrollInputAuditEvent_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollInputAuditEvent" ADD CONSTRAINT "PayrollInputAuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollIdentityMapping" ADD CONSTRAINT "PayrollIdentityMapping_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollImportBatch" ADD CONSTRAINT "PayrollImportBatch_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollImportBatch" ADD CONSTRAINT "PayrollImportBatch_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollImportRow" ADD CONSTRAINT "PayrollImportRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PayrollImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollInputValue" ADD CONSTRAINT "PayrollInputValue_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollComputedValue" ADD CONSTRAINT "PayrollComputedValue_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollExpenseEntry" ADD CONSTRAINT "PayrollExpenseEntry_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollExpenseEntry" ADD CONSTRAINT "PayrollExpenseEntry_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollReceipt" ADD CONSTRAINT "PayrollReceipt_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollReceipt" ADD CONSTRAINT "PayrollReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollDocuSignEnvelope" ADD CONSTRAINT "PayrollDocuSignEnvelope_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "PayrollReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollApprovalEvent" ADD CONSTRAINT "PayrollApprovalEvent_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollApprovalEvent" ADD CONSTRAINT "PayrollApprovalEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "TaskSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskSection" ADD CONSTRAINT "TaskSection_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskLabel" ADD CONSTRAINT "TaskLabel_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectReference" ADD CONSTRAINT "ProjectReference_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectReference" ADD CONSTRAINT "ProjectReference_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskLabelAssignment" ADD CONSTRAINT "TaskLabelAssignment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskLabelAssignment" ADD CONSTRAINT "TaskLabelAssignment_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "TaskLabel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
