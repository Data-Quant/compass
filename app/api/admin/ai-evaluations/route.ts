import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePilot, failure, sameOrigin } from "@/lib/ai-evaluations/http";
import {
  saveCycle,
  activate,
  getCycle,
  scheduleDue,
  requestArtifact,
  json,
  PilotError,
  memberConfig,
} from "@/lib/ai-evaluations/service";
import {
  configSchema,
  ratingSchema,
  validateRatings,
  calculateScore,
  type Evidence,
} from "@/lib/ai-evaluations/domain";
import { runOneJob } from "@/lib/ai-evaluations/worker";

export const maxDuration = 60;
export async function GET(request: NextRequest) {
  try {
    await requirePilot(true);
    const id = request.nextUrl.searchParams.get("cycleId");
    const [cycles, people, questions, mappings] = await Promise.all([
      prisma.aiEvaluationCycle.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.user.findMany({
        select: { id: true, name: true, position: true },
        orderBy: { name: "asc" },
      }),
      prisma.evaluationQuestion.findMany({
        where: { questionType: "RATING" },
        orderBy: { orderIndex: "asc" },
      }),
      prisma.evaluatorMapping.findMany({
        select: {
          evaluatorId: true,
          evaluateeId: true,
          relationshipType: true,
        },
      }),
    ]);
    const detail = id
      ? await Promise.all([
          prisma.aiEvaluationCheckIn.findMany({
            where: { cycleId: id },
            orderBy: { week: "desc" },
          }),
          prisma.aiEvaluationObservation.findMany({
            where: { cycleId: id },
            orderBy: { createdAt: "desc" },
          }),
          prisma.aiEvaluationArtifact.findMany({
            where: { cycleId: id },
            include: { reviews: { orderBy: { createdAt: "asc" } } },
            orderBy: { createdAt: "desc" },
          }),
          prisma.aiEvaluationJob.findMany({
            where: { cycleId: id },
            select: {
              id: true,
              operation: true,
              status: true,
              attempts: true,
              error: true,
              createdAt: true,
              model: true,
              usage: true,
            },
            orderBy: { createdAt: "desc" },
            take: 200,
          }),
          prisma.aiEvaluationTheme.findMany({
            where: { cycleId: id },
            orderBy: { createdAt: "desc" },
          }),
        ])
      : [[], [], [], [], []];
    return NextResponse.json({
      cycles,
      people,
      rubricDrafts: questions.map((q) => ({
        id: q.id,
        name: q.questionText,
        relationship: q.relationshipType,
        anchors: [
          q.rating1Description || "",
          q.rating2Description || "",
          q.rating3Description || "",
          q.rating4Description || "",
        ],
      })),
      mappings,
      checkIns: detail[0],
      observations: detail[1],
      artifacts: detail[2],
      jobs: detail[3],
      themes: detail[4],
      inferenceConfigured: Boolean(
        process.env.FIREWORKS_API_KEY && process.env.FIREWORKS_MODEL,
      ),
    });
  } catch (error) {
    return failure(error);
  }
}
const command = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("saveCycle"),
      id: z.string().optional(),
      revision: z.number().int().optional(),
      name: z.string(),
      startDate: z.string(),
      config: z.unknown(),
    })
    .strict(),
  z
    .object({
      action: z.literal("activate"),
      id: z.string(),
      revision: z.number().int(),
    })
    .strict(),
  z.object({ action: z.literal("runDue") }).strict(),
  z.object({ action: z.literal("retry"), id: z.string() }).strict(),
  z
    .object({
      action: z.literal("artifact"),
      cycleId: z.string(),
      evaluateeId: z.string(),
      kind: z.enum(["profile", "assessment"]),
    })
    .strict(),
  z
    .object({
      action: z.literal("review"),
      id: z.string(),
      decision: z.enum(["APPROVED", "RETURNED"]),
      reason: z.string().trim().min(1).max(4000),
      ratings: z.array(ratingSchema).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("theme"),
      cycleId: z.string(),
      evaluateeId: z.string(),
      id: z.string().optional(),
      text: z.string().trim().min(1).max(6000),
      sourceIds: z.array(z.string()).min(1).max(100),
      release: z.boolean(),
      withdraw: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("mergeIncident"),
      cycleId: z.string(),
      observationId: z.string(),
      targetObservationId: z.string(),
      reason: z.string().trim().min(1).max(1000),
    })
    .strict(),
]);
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    const user = await requirePilot(true);
    const input = command.parse(await request.json());
    switch (input.action) {
      case "saveCycle":
        return NextResponse.json(
          await saveCycle({ ...input, config: input.config }, user.id),
        );
      case "activate":
        await activate(input.id, input.revision);
        break;
      case "runDue":
        return NextResponse.json({
          scheduled: await scheduleDue(),
          worker: await runOneJob(),
        });
      case "retry": {
        const result = await prisma.aiEvaluationJob.updateMany({
          where: { id: input.id, status: "FAILED" },
          data: {
            status: "PENDING",
            attempts: 0,
            error: null,
            runAfter: new Date(),
            leaseUntil: null,
            leaseToken: null,
          },
        });
        if (!result.count)
          throw new PilotError("Only failed jobs can be retried", 409);
        break;
      }
      case "artifact":
        return NextResponse.json(
          await requestArtifact(input.cycleId, input.evaluateeId, input.kind),
        );
      case "review": {
        await prisma.$transaction(async (db) => {
          const artifact = await db.aiEvaluationArtifact.findUniqueOrThrow({
            where: { id: input.id },
            include: { cycle: true },
          });
          const config = configSchema.parse(artifact.cycle.config),
            member = memberConfig(config, artifact.evaluateeId);
          const rubric = config.rubric.filter(
            (r) => r.relationship in member.weights,
          );
          let ratings: z.infer<typeof ratingSchema>[] | undefined;
          if (artifact.kind === "ASSESSMENT") {
            const original = z
              .object({ ratings: z.array(ratingSchema) })
              .parse(artifact.content).ratings;
            const evidence = await db.aiEvaluationObservation.findMany({
              where: {
                cycleId: artifact.cycleId,
                evaluateeId: artifact.evaluateeId,
              },
            });
            ratings = validateRatings(
              input.ratings ?? original,
              rubric,
              evidence as Evidence[],
              config,
            );
            if (
              input.decision === "APPROVED" &&
              calculateScore(ratings, rubric, member.weights).overall === null
            )
              throw new PilotError(
                "Resolve insufficient evidence before approving the quarterly score",
              );
          } else if (input.ratings)
            throw new PilotError("Profiles do not have ratings");
          const result = await db.aiEvaluationArtifact.updateMany({
            where: { id: artifact.id, status: "DRAFT" },
            data: { status: input.decision },
          });
          if (!result.count)
            throw new PilotError("Assessment was already reviewed", 409);
          await db.aiEvaluationReview.create({
            data: {
              cycleId: artifact.cycleId,
              artifactId: artifact.id,
              reviewerId: user.id,
              action: input.decision,
              reason: input.reason,
              ...(ratings ? { ratings: json(ratings) } : {}),
            },
          });
        });
        break;
      }
      case "theme": {
        const cycle = await getCycle(input.cycleId);
        memberConfig(configSchema.parse(cycle.config), input.evaluateeId);
        const sources = await prisma.aiEvaluationObservation.count({
          where: {
            cycleId: input.cycleId,
            evaluateeId: input.evaluateeId,
            id: { in: input.sourceIds },
          },
        });
        if (sources !== new Set(input.sourceIds).size)
          throw new PilotError("Theme references invalid evidence");
        const data = {
          text: input.text,
          sourceIds: json(input.sourceIds),
          status: input.release ? "RELEASED" : "DRAFT",
          releasedAt: input.release ? new Date() : null,
        };
        if (input.id) {
          const previous = await prisma.aiEvaluationTheme.findFirst({
            where: {
              id: input.id,
              cycleId: input.cycleId,
              evaluateeId: input.evaluateeId,
            },
          });
          if (!previous) throw new PilotError("Theme not found", 404);
          if (
            previous.status === "RELEASED" &&
            !input.release &&
            !input.withdraw
          )
            throw new PilotError(
              "Withdrawing a released theme requires an explicit withdrawal action",
            );
          const history = Array.isArray(previous.history)
            ? previous.history
            : [];
          const changed = await prisma.aiEvaluationTheme.updateMany({
            where: { id: previous.id, updatedAt: previous.updatedAt },
            data: {
              ...data,
              history: json([
                ...history,
                {
                  text: previous.text,
                  sourceIds: previous.sourceIds,
                  status: previous.status,
                  at: new Date().toISOString(),
                  actorId: user.id,
                },
              ]),
            },
          });
          if (!changed.count)
            throw new PilotError("Theme changed; reload before saving", 409);
        } else
          await prisma.aiEvaluationTheme.create({
            data: {
              ...data,
              cycleId: input.cycleId,
              evaluateeId: input.evaluateeId,
              createdById: user.id,
            },
          });
        break;
      }
      case "mergeIncident": {
        await prisma.$transaction(async (db) => {
          const source = await db.aiEvaluationObservation.findFirstOrThrow({
            where: { id: input.observationId, cycleId: input.cycleId },
          });
          const target = await db.aiEvaluationObservation.findFirstOrThrow({
            where: {
              id: input.targetObservationId,
              cycleId: input.cycleId,
              evaluateeId: source.evaluateeId,
              competencyId: source.competencyId,
            },
          });
          await db.aiEvaluationObservation.updateMany({
            where: {
              cycleId: input.cycleId,
              evaluateeId: source.evaluateeId,
              competencyId: source.competencyId,
              incidentKey: source.incidentKey,
            },
            data: { incidentKey: target.incidentKey },
          });
          await db.aiEvaluationArtifact.updateMany({
            where: { cycleId: input.cycleId, evaluateeId: source.evaluateeId },
            data: { status: "STALE" },
          });
          await db.aiEvaluationJob.create({
            data: {
              cycleId: input.cycleId,
              key: `merge:${crypto.randomUUID()}`,
              operation: "incident_merge",
              status: "SUCCEEDED",
              rubricVersion: 1,
              payload: json({ ...input, actorId: user.id }),
            },
          });
        });
        break;
      }
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return failure(error);
  }
}
