ALTER TABLE "Task" ADD COLUMN "parentTaskId" TEXT;

CREATE TABLE "TaskAssistant" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskAssistant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Task_parentTaskId_idx" ON "Task"("parentTaskId");
CREATE UNIQUE INDEX "TaskAssistant_taskId_userId_key" ON "TaskAssistant"("taskId", "userId");
CREATE INDEX "TaskAssistant_taskId_idx" ON "TaskAssistant"("taskId");
CREATE INDEX "TaskAssistant_userId_idx" ON "TaskAssistant"("userId");
CREATE INDEX "TaskAssistant_assignedById_idx" ON "TaskAssistant"("assignedById");

ALTER TABLE "Task" ADD CONSTRAINT "Task_parentTaskId_fkey" FOREIGN KEY ("parentTaskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskAssistant" ADD CONSTRAINT "TaskAssistant_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskAssistant" ADD CONSTRAINT "TaskAssistant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskAssistant" ADD CONSTRAINT "TaskAssistant_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
