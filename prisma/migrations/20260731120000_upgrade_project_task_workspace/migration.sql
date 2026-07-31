-- Add the on-hold project lifecycle state without changing existing rows.
ALTER TYPE "ProjectStatus" ADD VALUE 'ON_HOLD' AFTER 'ACTIVE';

-- Backlog and late-completion metadata are additive and default safely for
-- existing application writes.
ALTER TABLE "TaskSection"
  ADD COLUMN "isBacklog" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Task"
  ADD COLUMN "completedLate" BOOLEAN NOT NULL DEFAULT false;

-- Preserve existing Backlog-named sections and normalize them into the new
-- default Backlog semantics.

-- Consolidate duplicate Backlog-named sections without losing their tasks,
-- then normalize the one remaining Backlog per project.
WITH ranked_backlogs AS (
  SELECT
    "id",
    first_value("id") OVER (
      PARTITION BY "projectId"
      ORDER BY "orderIndex" ASC, "createdAt" ASC, "id" ASC
      ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
    ) AS primary_backlog_id,
    row_number() OVER (
      PARTITION BY "projectId"
      ORDER BY "orderIndex" ASC, "createdAt" ASC, "id" ASC
    ) AS backlog_rank
  FROM "TaskSection"
  WHERE regexp_replace(lower("name"), '[^a-z0-9]', '', 'g') = 'backlog'
)
UPDATE "Task" AS task
SET "sectionId" = ranked.primary_backlog_id
FROM ranked_backlogs AS ranked
WHERE ranked.backlog_rank > 1
  AND task."sectionId" = ranked."id";

WITH ranked_backlogs AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "projectId"
      ORDER BY "orderIndex" ASC, "createdAt" ASC, "id" ASC
    ) AS backlog_rank
  FROM "TaskSection"
  WHERE regexp_replace(lower("name"), '[^a-z0-9]', '', 'g') = 'backlog'
)
DELETE FROM "TaskSection" AS section
USING ranked_backlogs AS ranked
WHERE ranked.backlog_rank > 1
  AND section."id" = ranked."id";

UPDATE "TaskSection" AS section
SET
  "name" = 'Backlog',
  "canonicalStatus" = 'TODO'::"TaskStatus",
  "isDefault" = true,
  "isDone" = false,
  "isBacklog" = true,
  "color" = COALESCE(NULLIF(section."color", ''), '#64748b'),
  "orderIndex" = 0
WHERE regexp_replace(lower(section."name"), '[^a-z0-9]', '', 'g') = 'backlog';

-- Prisma cuid values are opaque text to PostgreSQL. These migration-only IDs
-- are stable, unique text values and remain fully compatible with the schema.
INSERT INTO "TaskSection" (
  "id",
  "projectId",
  "name",
  "color",
  "canonicalStatus",
  "isDefault",
  "isDone",
  "isBacklog",
  "orderIndex",
  "createdAt"
)
SELECT
  'backlog_' || md5(project."id" || clock_timestamp()::text || random()::text),
  project."id",
  'Backlog',
  '#64748b',
  'TODO'::"TaskStatus",
  true,
  false,
  true,
  0,
  CURRENT_TIMESTAMP
FROM "Project" AS project
WHERE NOT EXISTS (
  SELECT 1
  FROM "TaskSection" AS section
  WHERE section."projectId" = project."id"
    AND section."isBacklog" = true
);

-- Rebase every project's ordering rather than incrementing historical values:
-- old rows may contain negatives or PostgreSQL's maximum integer. Backlog is
-- always first, and all remaining sections retain their relative order.
WITH ordered_sections AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "projectId"
      ORDER BY
        CASE WHEN "isBacklog" = true THEN 0 ELSE 1 END,
        "orderIndex" ASC,
        "createdAt" ASC,
        "id" ASC
    ) - 1 AS new_order_index
  FROM "TaskSection"
)
UPDATE "TaskSection" AS section
SET "orderIndex" = ordered.new_order_index::INTEGER
FROM ordered_sections AS ordered
WHERE section."id" = ordered."id";

CREATE UNIQUE INDEX "TaskSection_one_backlog_per_project_key"
  ON "TaskSection"("projectId")
  WHERE "isBacklog" = true;

-- Keep legacy rows false. An earlier migration synthesized completedAt = NOW()
-- for some already-done tasks, so historical timestamps cannot prove lateness.
-- New completions record completedLate prospectively using Karachi calendar days.

CREATE TABLE "ProjectTaskViewPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "assigneeFilter" TEXT NOT NULL DEFAULT 'ME',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProjectTaskViewPreference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectTaskViewPreference_userId_key"
  ON "ProjectTaskViewPreference"("userId");

CREATE INDEX "ProjectTaskViewPreference_assigneeFilter_idx"
  ON "ProjectTaskViewPreference"("assigneeFilter");

ALTER TABLE "ProjectTaskViewPreference"
  ADD CONSTRAINT "ProjectTaskViewPreference_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
