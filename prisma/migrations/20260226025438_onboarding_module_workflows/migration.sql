-- CreateEnum
CREATE TYPE "PositionStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PositionPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "NewHireStatus" AS ENUM ('PENDING', 'ONBOARDING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "OnboardingModuleStatus" AS ENUM ('LOCKED', 'IN_PROGRESS', 'COMPLETED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "benefitCategoryId" TEXT,
ADD COLUMN     "isTeamLead" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "onboardingCompleted" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "location" TEXT,
    "department" TEXT,
    "teamLeadId" TEXT,
    "priority" "PositionPriority" NOT NULL DEFAULT 'MEDIUM',
    "estimatedCloseDate" TIMESTAMP(3),
    "status" "PositionStatus" NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewHire" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT,
    "department" TEXT,
    "teamLeadId" TEXT,
    "email" TEXT NOT NULL,
    "onboardingDate" TIMESTAMP(3) NOT NULL,
    "buddyId" TEXT,
    "status" "NewHireStatus" NOT NULL DEFAULT 'PENDING',
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewHire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamLeadForm" (
    "id" TEXT NOT NULL,
    "newHireId" TEXT NOT NULL,
    "emailGroups" TEXT,
    "discordChannels" TEXT,
    "tools" TEXT,
    "earlyKpis" TEXT,
    "availableOnDate" TEXT,
    "resources" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamLeadForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecurityChecklist" (
    "id" TEXT NOT NULL,
    "newHireId" TEXT NOT NULL,
    "equipmentReady" BOOLEAN NOT NULL DEFAULT false,
    "equipmentReceived" BOOLEAN NOT NULL DEFAULT false,
    "securityOnboarding" BOOLEAN NOT NULL DEFAULT false,
    "addedToEmailGroups" BOOLEAN NOT NULL DEFAULT false,
    "discordSetup" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SecurityChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingModule" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "status" "OnboardingModuleStatus" NOT NULL DEFAULT 'LOCKED',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingQuizQuestion" (
    "id" TEXT NOT NULL,
    "questionText" TEXT NOT NULL,
    "optionsJson" JSONB NOT NULL,
    "correctAnswer" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingQuizQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuizAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "totalQuestions" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "answersJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuizAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "quizPassPercent" INTEGER NOT NULL DEFAULT 80,
    "maxQuizAttempts" INTEGER NOT NULL DEFAULT 3,
    "welcomeMessage" TEXT NOT NULL DEFAULT 'Welcome to Compass onboarding.',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BenefitCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "employeeType" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BenefitCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Benefit" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Benefit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Position_status_idx" ON "Position"("status");

-- CreateIndex
CREATE INDEX "Position_teamLeadId_idx" ON "Position"("teamLeadId");

-- CreateIndex
CREATE INDEX "Position_department_idx" ON "Position"("department");

-- CreateIndex
CREATE UNIQUE INDEX "NewHire_positionId_key" ON "NewHire"("positionId");

-- CreateIndex
CREATE UNIQUE INDEX "NewHire_userId_key" ON "NewHire"("userId");

-- CreateIndex
CREATE INDEX "NewHire_status_idx" ON "NewHire"("status");

-- CreateIndex
CREATE INDEX "NewHire_teamLeadId_idx" ON "NewHire"("teamLeadId");

-- CreateIndex
CREATE INDEX "NewHire_buddyId_idx" ON "NewHire"("buddyId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamLeadForm_newHireId_key" ON "TeamLeadForm"("newHireId");

-- CreateIndex
CREATE UNIQUE INDEX "SecurityChecklist_newHireId_key" ON "SecurityChecklist"("newHireId");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingModule_slug_key" ON "OnboardingModule"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingModule_orderIndex_key" ON "OnboardingModule"("orderIndex");

-- CreateIndex
CREATE INDEX "OnboardingProgress_userId_status_idx" ON "OnboardingProgress"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingProgress_userId_moduleId_key" ON "OnboardingProgress"("userId", "moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingQuizQuestion_orderIndex_key" ON "OnboardingQuizQuestion"("orderIndex");

-- CreateIndex
CREATE INDEX "QuizAttempt_userId_createdAt_idx" ON "QuizAttempt"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BenefitCategory_name_key" ON "BenefitCategory"("name");

-- CreateIndex
CREATE INDEX "BenefitCategory_isActive_idx" ON "BenefitCategory"("isActive");

-- CreateIndex
CREATE INDEX "Benefit_categoryId_orderIndex_idx" ON "Benefit"("categoryId", "orderIndex");

-- CreateIndex
CREATE INDEX "Benefit_isActive_idx" ON "Benefit"("isActive");

-- CreateIndex
CREATE INDEX "User_benefitCategoryId_idx" ON "User"("benefitCategoryId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_benefitCategoryId_fkey" FOREIGN KEY ("benefitCategoryId") REFERENCES "BenefitCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_teamLeadId_fkey" FOREIGN KEY ("teamLeadId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewHire" ADD CONSTRAINT "NewHire_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewHire" ADD CONSTRAINT "NewHire_teamLeadId_fkey" FOREIGN KEY ("teamLeadId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewHire" ADD CONSTRAINT "NewHire_buddyId_fkey" FOREIGN KEY ("buddyId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NewHire" ADD CONSTRAINT "NewHire_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamLeadForm" ADD CONSTRAINT "TeamLeadForm_newHireId_fkey" FOREIGN KEY ("newHireId") REFERENCES "NewHire"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecurityChecklist" ADD CONSTRAINT "SecurityChecklist_newHireId_fkey" FOREIGN KEY ("newHireId") REFERENCES "NewHire"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingProgress" ADD CONSTRAINT "OnboardingProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingProgress" ADD CONSTRAINT "OnboardingProgress_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "OnboardingModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuizAttempt" ADD CONSTRAINT "QuizAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Benefit" ADD CONSTRAINT "Benefit_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "BenefitCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
