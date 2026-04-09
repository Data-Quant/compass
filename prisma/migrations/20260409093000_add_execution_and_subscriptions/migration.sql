-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'EXECUTION';

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELED');

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "team" TEXT,
    "usersText" TEXT,
    "paymentMethodText" TEXT,
    "purpose" TEXT,
    "costText" TEXT,
    "subscriptionTypeText" TEXT,
    "billedToText" TEXT,
    "renewalText" TEXT,
    "noticePeriodText" TEXT,
    "personInChargeText" TEXT,
    "lastPaymentText" TEXT,
    "notes" TEXT,
    "sourceSheet" TEXT,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionOwner" (
    "subscriptionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionOwner_pkey" PRIMARY KEY ("subscriptionId","userId")
);

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "Subscription_team_idx" ON "Subscription"("team");

-- CreateIndex
CREATE INDEX "SubscriptionOwner_userId_idx" ON "SubscriptionOwner"("userId");

-- AddForeignKey
ALTER TABLE "SubscriptionOwner" ADD CONSTRAINT "SubscriptionOwner_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionOwner" ADD CONSTRAINT "SubscriptionOwner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
