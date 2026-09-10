import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requirePilot, failure, sameOrigin } from "@/lib/ai-evaluations/http";
import {
  saveAnswer,
  releasedThemes,
  json,
  PilotError,
} from "@/lib/ai-evaluations/service";

export async function GET() {
  try {
    const user = await requirePilot();
    const checkIns = await prisma.aiEvaluationCheckIn.findMany({
      where: { evaluatorId: user.id },
      orderBy: [{ cycle: { startDate: "desc" } }, { week: "desc" }],
      select: {
        id: true,
        evaluateeId: true,
        relationship: true,
        competencyId: true,
        week: true,
        status: true,
        question: true,
        answer: true,
        clarification: true,
        clarificationAnswer: true,
        noInteraction: true,
        revision: true,
        submittedAt: true,
        cycle: { select: { name: true, startDate: true, status: true } },
      },
    });
    const people = await prisma.user.findMany({
      where: { id: { in: [...new Set(checkIns.map((c) => c.evaluateeId))] } },
      select: { id: true, name: true },
    });
    const failedJobs = await prisma.aiEvaluationJob.findMany({
      where: {
        status: "FAILED",
        key: {
          in: checkIns.flatMap((c) => [
            `question:${c.id}`,
            `clarification:${c.id}`,
            `extraction:${c.id}`,
          ]),
        },
      },
      select: { key: true },
    });
    return NextResponse.json({
      checkIns: checkIns.map((c) => ({
        ...c,
        processingFailed: failedJobs.some((j) => j.key.endsWith(`:${c.id}`)),
        evaluateeName:
          people.find((p) => p.id === c.evaluateeId)?.name ?? "Employee",
      })),
      themes: await releasedThemes(user.id),
    });
  } catch (error) {
    return failure(error);
  }
}
const answerSchema = z
  .object({
    action: z.enum(["save", "clarify", "submit"]),
    id: z.string(),
    revision: z.number().int().min(0),
    answer: z.string().max(8000),
    clarificationAnswer: z.string().max(4000),
    noInteraction: z.boolean(),
  })
  .strict();
const correctionSchema = z
  .object({
    action: z.literal("correct"),
    id: z.string(),
    text: z.string().trim().min(1).max(4000),
  })
  .strict();
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    const user = await requirePilot();
    const input = z
      .union([answerSchema, correctionSchema])
      .parse(await request.json());
    if (input.action === "correct") {
      const theme = await prisma.aiEvaluationTheme.findFirst({
        where: { id: input.id, evaluateeId: user.id, status: "RELEASED" },
      });
      if (!theme) throw new PilotError("Released theme not found", 404);
      const corrections = Array.isArray(theme.corrections)
        ? theme.corrections
        : [];
      const result = await prisma.aiEvaluationTheme.updateMany({
        where: { id: theme.id, updatedAt: theme.updatedAt },
        data: {
          corrections: json([
            ...corrections,
            {
              text: input.text,
              at: new Date().toISOString(),
              actorId: user.id,
            },
          ]),
        },
      });
      if (!result.count)
        throw new PilotError("Theme changed; reload and retry", 409);
      return NextResponse.json({ success: true });
    }
    return NextResponse.json(await saveAnswer(input, user.id));
  } catch (error) {
    return failure(error);
  }
}
