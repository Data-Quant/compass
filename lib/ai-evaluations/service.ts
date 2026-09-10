import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  configSchema,
  draftConfigSchema,
  cycleStart,
  cycleWeek,
  selectWeekly,
  WEEK_MS,
  type PilotConfig,
} from "./domain";

export const json = (value: unknown) =>
  JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export class PilotError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function enabled() {
  return process.env.AI_EVALUATIONS_ENABLED === "true";
}
export async function getCycle(id: string) {
  const cycle = await prisma.aiEvaluationCycle.findUnique({ where: { id } });
  if (!cycle) throw new PilotError("Cycle not found", 404);
  return cycle;
}
export async function enqueue(
  db: Prisma.TransactionClient,
  cycle: { id: string; revision: number },
  operation: string,
  key: string,
  payload: unknown,
) {
  return db.aiEvaluationJob.upsert({
    where: { key },
    create: {
      cycleId: cycle.id,
      rubricVersion: cycle.revision,
      operation,
      key,
      payload: json(payload),
    },
    update: {},
  });
}
export async function saveCycle(
  input: {
    id?: string;
    revision?: number;
    name: string;
    startDate: string;
    config: unknown;
  },
  userId: string,
) {
  // Drafts intentionally accept incomplete anchors; activation validates the full rubric.
  if (!input.name.trim() || input.name.length > 200)
    throw new PilotError("Enter a cycle name");
  let startDate: Date;
  try {
    startDate = cycleStart(input.startDate);
  } catch {
    throw new PilotError("Enter a valid start date");
  }
  const draft = draftConfigSchema.parse(input.config);
  if (input.id) {
    if (input.revision === undefined)
      throw new PilotError("A cycle revision is required");
    const result = await prisma.aiEvaluationCycle.updateMany({
      where: { id: input.id, status: "DRAFT", revision: input.revision },
      data: {
        name: input.name,
        startDate,
        config: json(draft),
        revision: { increment: 1 },
      },
    });
    if (!result.count)
      throw new PilotError(
        "Cycle changed or is already active; reload before editing",
        409,
      );
    return getCycle(input.id);
  }
  return prisma.aiEvaluationCycle.create({
    data: {
      name: input.name,
      startDate,
      config: json(draft),
      createdById: userId,
    },
  });
}
export async function activate(id: string, revision: number) {
  const cycle = await getCycle(id);
  const config = configSchema.parse(cycle.config);
  const userIds = [
    ...new Set([
      ...config.members.map((m) => m.employeeId),
      ...config.assignments.map((a) => a.evaluatorId),
    ]),
  ];
  const count = await prisma.user.count({ where: { id: { in: userIds } } });
  if (count !== userIds.length)
    throw new PilotError("An enrolled employee or evaluator no longer exists");
  if (new Date().getTime() >= cycle.startDate.getTime() + 12 * WEEK_MS)
    throw new PilotError("Choose a cycle that has not ended");
  const result = await prisma.aiEvaluationCycle.updateMany({
    where: { id, status: "DRAFT", revision },
    data: { status: "ACTIVE", config: json(config), activatedAt: new Date() },
  });
  if (!result.count)
    throw new PilotError("Cycle changed; reload before activating", 409);
}
export async function scheduleDue(now = new Date()) {
  const cycles = await prisma.aiEvaluationCycle.findMany({
    where: { status: "ACTIVE" },
  });
  let scheduled = 0;
  for (const cycle of cycles) {
    const week = cycleWeek(cycle.startDate, now);
    if (!week) continue;
    const config = configSchema.parse(cycle.config);
    const history = await prisma.aiEvaluationCheckIn.findMany({
      where: { cycleId: cycle.id, week: { lt: week } },
    });
    const observations = await prisma.aiEvaluationObservation.findMany({
      where: { cycleId: cycle.id },
    });
    // Freeze the weekly selection once any rows exist. New evidence must not
    // change this week's assignments or exceed the evaluator budget on a retry.
    const existing = await prisma.aiEvaluationCheckIn.count({
      where: { cycleId: cycle.id, week },
    });
    if (existing) continue;
    const assignments = selectWeekly(config, history, observations);
    await prisma.$transaction(async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`pilot-week:${cycle.id}:${week}`}))`;
      if (
        await db.aiEvaluationCheckIn.count({
          where: { cycleId: cycle.id, week },
        })
      )
        return;
      const rows = assignments.map(assignment => ({ id: randomUUID(), cycleId: cycle.id, week, ...assignment }));
      await db.aiEvaluationCheckIn.createMany({ data: rows });
      await db.aiEvaluationJob.createMany({ data: rows.map(row => ({ cycleId: cycle.id, rubricVersion: cycle.revision, operation: 'question', key: `question:${row.id}`, payload: json({ checkInId: row.id }) })) });
      scheduled += rows.length;
    });
  }
  return scheduled;
}
export async function saveAnswer(
  input: {
    id: string;
    revision: number;
    answer: string;
    clarificationAnswer: string;
    noInteraction: boolean;
    action: "save" | "clarify" | "submit";
  },
  userId: string,
) {
  return prisma.$transaction(async (db) => {
    const row = await db.aiEvaluationCheckIn.findFirst({
      where: { id: input.id, evaluatorId: userId },
      include: { cycle: true },
    });
    if (!row) throw new PilotError("Check-in not found", 404);
    if (
      row.cycle.status !== "ACTIVE" ||
      !["DRAFT", "CLARIFYING"].includes(row.status) ||
      row.submittedAt
    )
      throw new PilotError("This check-in cannot be edited", 409);
    if (row.status === "CLARIFYING")
      throw new PilotError(
        "Clarification is still processing; retry shortly",
        409,
      );
    const windowStart =
      row.cycle.startDate.getTime() + (row.week - 1) * WEEK_MS;
    if (Date.now() < windowStart || Date.now() >= windowStart + WEEK_MS)
      throw new PilotError("This weekly window is closed for submissions", 409);
    if (input.action !== "save" && !input.noInteraction && !input.answer.trim())
      throw new PilotError(
        "Enter an observation or choose no relevant interaction",
      );
    if (input.clarificationAnswer.trim() && !row.clarification)
      throw new PilotError("No clarification was requested");
    if (
      input.action === "clarify" &&
      (row.clarification !== null || input.noInteraction)
    )
      throw new PilotError("One clarification is available per check-in");
    const history = Array.isArray(row.history) ? row.history : [];
    const status =
      input.action === "submit"
        ? "SUBMITTED"
        : input.action === "clarify"
          ? "CLARIFYING"
          : "DRAFT";
    const result = await db.aiEvaluationCheckIn.updateMany({
      where: { id: row.id, revision: input.revision, status: "DRAFT" },
      data: {
        answer: input.answer,
        clarificationAnswer: input.clarificationAnswer,
        noInteraction: input.noInteraction,
        status,
        revision: { increment: 1 },
        submittedAt: input.action === "submit" ? new Date() : null,
        history: json([
          ...history,
          {
            revision: row.revision,
            answer: row.answer,
            clarificationAnswer: row.clarificationAnswer,
            noInteraction: row.noInteraction,
            at: new Date().toISOString(),
            actorId: userId,
          },
        ]),
      },
    });
    if (!result.count)
      throw new PilotError(
        "This answer changed in another tab; reload before saving",
        409,
      );
    if (input.action === "clarify")
      await enqueue(db, row.cycle, "clarification", `clarification:${row.id}`, {
        checkInId: row.id,
      });
    if (input.action === "submit" && !input.noInteraction)
      await enqueue(db, row.cycle, "extraction", `extraction:${row.id}`, {
        checkInId: row.id,
      });
    return { status };
  });
}
export async function requestArtifact(
  cycleId: string,
  evaluateeId: string,
  kind: "profile" | "assessment",
) {
  const cycle = await getCycle(cycleId);
  const config = configSchema.parse(cycle.config);
  if (
    cycle.status !== "ACTIVE" ||
    !config.members.some((m) => m.employeeId === evaluateeId)
  )
    throw new PilotError("Employee is not in an active pilot");
  if (
    kind === "assessment" &&
    Date.now() < cycle.startDate.getTime() + 12 * WEEK_MS
  )
    throw new PilotError("Quarterly scoring opens after week 12");
  if (kind === "assessment") {
    const pending = await prisma.aiEvaluationJob.count({
      where: { cycleId, operation: "extraction", status: { not: "SUCCEEDED" } },
    });
    if (pending)
      throw new PilotError(
        "Resolve pending or failed evidence extraction before quarterly scoring",
      );
  }
  // Hash the source version into the key: retries cannot create duplicate artifacts.
  const observations = await prisma.aiEvaluationObservation.findMany({
    where: { cycleId, evaluateeId },
    orderBy: { id: "asc" },
  });
  const returned = await prisma.aiEvaluationArtifact.count({
    where: {
      cycleId,
      evaluateeId,
      kind: kind.toUpperCase(),
      status: { in: ["RETURNED", "STALE"] },
    },
  });
  const { createHash } = await import("node:crypto");
  const digest = createHash("sha256")
    .update(JSON.stringify({ observations, returned }))
    .digest("hex");
  return enqueue(
    prisma,
    cycle,
    kind,
    `${kind}:${cycleId}:${evaluateeId}:${digest}`,
    { evaluateeId, sourceIds: observations.map((o) => o.id) },
  );
}
export async function releasedThemes(userId: string) {
  return prisma.aiEvaluationTheme.findMany({
    where: { evaluateeId: userId, status: "RELEASED" },
    select: {
      id: true,
      text: true,
      releasedAt: true,
      corrections: true,
      cycle: { select: { name: true } },
    },
    orderBy: { releasedAt: "desc" },
  });
}
export function memberConfig(config: PilotConfig, evaluateeId: string) {
  const member = config.members.find((m) => m.employeeId === evaluateeId);
  if (!member) throw new PilotError("Employee not enrolled", 404);
  return member;
}
export const newToken = () => randomUUID();
