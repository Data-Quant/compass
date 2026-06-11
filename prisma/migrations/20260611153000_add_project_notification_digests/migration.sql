-- CreateEnum
CREATE TYPE "ProjectNotificationDigestFrequency" AS ENUM ('HOURLY', 'DAILY', 'WEEKLY');

-- CreateTable
CREATE TABLE "ProjectNotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "digestEnabled" BOOLEAN NOT NULL DEFAULT false,
    "digestFrequency" "ProjectNotificationDigestFrequency" NOT NULL DEFAULT 'DAILY',
    "digestTime" TEXT NOT NULL DEFAULT '09:00',
    "digestWeekday" INTEGER NOT NULL DEFAULT 1,
    "digestTimezone" TEXT NOT NULL DEFAULT 'Asia/Karachi',
    "lastDigestSentAt" TIMESTAMP(3),
    "nextDigestAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectNotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectNotificationDigestItem" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "projectId" TEXT,
    "taskId" TEXT,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "heading" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "actionUrl" TEXT,
    "actionLabel" TEXT,
    "dedupeKey" TEXT,
    "sentAt" TIMESTAMP(3),
    "skippedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectNotificationDigestItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectNotificationPreference_userId_key" ON "ProjectNotificationPreference"("userId");

-- CreateIndex
CREATE INDEX "ProjectNotificationPreference_digestEnabled_nextDigestAt_idx" ON "ProjectNotificationPreference"("digestEnabled", "nextDigestAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectNotificationDigestItem_dedupeKey_key" ON "ProjectNotificationDigestItem"("dedupeKey");

-- CreateIndex
CREATE INDEX "ProjectNotificationDigestItem_recipientId_sentAt_skippedAt_createdAt_idx" ON "ProjectNotificationDigestItem"("recipientId", "sentAt", "skippedAt", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectNotificationDigestItem_sentAt_skippedAt_createdAt_idx" ON "ProjectNotificationDigestItem"("sentAt", "skippedAt", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectNotificationDigestItem_projectId_idx" ON "ProjectNotificationDigestItem"("projectId");

-- CreateIndex
CREATE INDEX "ProjectNotificationDigestItem_taskId_idx" ON "ProjectNotificationDigestItem"("taskId");

-- AddForeignKey
ALTER TABLE "ProjectNotificationPreference" ADD CONSTRAINT "ProjectNotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectNotificationDigestItem" ADD CONSTRAINT "ProjectNotificationDigestItem_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
