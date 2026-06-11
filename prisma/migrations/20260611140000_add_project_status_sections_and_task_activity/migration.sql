ALTER TABLE "TaskSection"
  ADD COLUMN "color" TEXT NOT NULL DEFAULT '#6366f1',
  ADD COLUMN "canonicalStatus" "TaskStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isDone" BOOLEAN NOT NULL DEFAULT false;

UPDATE "TaskSection"
SET
  "canonicalStatus" = CASE
    WHEN regexp_replace(lower("name"), '[^a-z0-9]', '', 'g') IN ('todo', 'backlog') THEN 'TODO'::"TaskStatus"
    WHEN regexp_replace(lower("name"), '[^a-z0-9]', '', 'g') IN ('done', 'complete', 'completed') THEN 'DONE'::"TaskStatus"
    ELSE 'IN_PROGRESS'::"TaskStatus"
  END,
  "isDefault" = regexp_replace(lower("name"), '[^a-z0-9]', '', 'g') IN ('todo', 'inprogress', 'doing', 'done', 'complete', 'completed'),
  "isDone" = regexp_replace(lower("name"), '[^a-z0-9]', '', 'g') IN ('done', 'complete', 'completed'),
  "color" = CASE
    WHEN regexp_replace(lower("name"), '[^a-z0-9]', '', 'g') IN ('todo', 'backlog') THEN '#94a3b8'
    WHEN regexp_replace(lower("name"), '[^a-z0-9]', '', 'g') IN ('done', 'complete', 'completed') THEN '#22c55e'
    ELSE '#60a5fa'
  END;

UPDATE "Task" AS t
SET
  "status" = s."canonicalStatus",
  "completedAt" = CASE
    WHEN s."isDone" = true AND t."completedAt" IS NULL THEN NOW()
    WHEN s."isDone" = false THEN NULL
    ELSE t."completedAt"
  END
FROM "TaskSection" AS s
WHERE t."sectionId" = s."id";

CREATE TABLE "TaskActivity" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "actorId" TEXT,
  "summary" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TaskActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TaskActivity_taskId_idx" ON "TaskActivity"("taskId");
CREATE INDEX "TaskActivity_actorId_idx" ON "TaskActivity"("actorId");
CREATE INDEX "TaskActivity_createdAt_idx" ON "TaskActivity"("createdAt");

ALTER TABLE "TaskActivity" ADD CONSTRAINT "TaskActivity_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskActivity" ADD CONSTRAINT "TaskActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
