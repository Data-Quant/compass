ALTER TYPE "PreEvaluationEvaluateeType" ADD VALUE IF NOT EXISTS 'PEER';

INSERT INTO "EvaluatorMapping" ("id", "evaluatorId", "evaluateeId", "relationshipType", "isSelfEvaluation", "createdAt")
SELECT
  md5(m."evaluateeId" || ':' || m."evaluatorId" || ':DIRECT_REPORT'),
  m."evaluateeId",
  m."evaluatorId",
  'DIRECT_REPORT'::"RelationshipType",
  false,
  m."createdAt"
FROM "EvaluatorMapping" m
LEFT JOIN "EvaluatorMapping" inverse
  ON inverse."evaluatorId" = m."evaluateeId"
 AND inverse."evaluateeId" = m."evaluatorId"
 AND inverse."relationshipType" = 'DIRECT_REPORT'
WHERE m."relationshipType" = 'TEAM_LEAD'
  AND inverse."id" IS NULL;

INSERT INTO "EvaluatorMapping" ("id", "evaluatorId", "evaluateeId", "relationshipType", "isSelfEvaluation", "createdAt")
SELECT
  md5(m."evaluateeId" || ':' || m."evaluatorId" || ':TEAM_LEAD'),
  m."evaluateeId",
  m."evaluatorId",
  'TEAM_LEAD'::"RelationshipType",
  false,
  m."createdAt"
FROM "EvaluatorMapping" m
LEFT JOIN "EvaluatorMapping" inverse
  ON inverse."evaluatorId" = m."evaluateeId"
 AND inverse."evaluateeId" = m."evaluatorId"
 AND inverse."relationshipType" = 'TEAM_LEAD'
WHERE m."relationshipType" = 'DIRECT_REPORT'
  AND inverse."id" IS NULL;

INSERT INTO "EvaluatorMapping" ("id", "evaluatorId", "evaluateeId", "relationshipType", "isSelfEvaluation", "createdAt")
SELECT
  md5(m."evaluateeId" || ':' || m."evaluatorId" || ':PEER'),
  m."evaluateeId",
  m."evaluatorId",
  'PEER'::"RelationshipType",
  false,
  m."createdAt"
FROM "EvaluatorMapping" m
LEFT JOIN "EvaluatorMapping" inverse
  ON inverse."evaluatorId" = m."evaluateeId"
 AND inverse."evaluateeId" = m."evaluatorId"
 AND inverse."relationshipType" = 'PEER'
WHERE m."relationshipType" = 'PEER'
  AND m."evaluatorId" <> m."evaluateeId"
  AND inverse."id" IS NULL;
