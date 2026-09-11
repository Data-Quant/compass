import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { syntheticConfig } from "../tests/fixtures/ai-evaluation-cases";
import { cycleStart } from "../lib/ai-evaluations/domain";

async function main() {
  const url = new URL(process.env.DATABASE_URL || "");
  const localPilot =
    ["127.0.0.1", "localhost"].includes(url.hostname) &&
    url.pathname === "/compass_ai_pilot";
  const hostedPilot =
    process.argv.includes("--hosted-synthetic") &&
    url.hostname === process.env.PILOT_SEED_ALLOWED_HOST &&
    url.hostname.endsWith(".neon.tech") &&
    url.pathname === "/neondb";
  if (!localPilot && !hostedPilot)
    throw new Error(
      "Synthetic seed requires the local pilot database or an explicitly allowlisted hosted test endpoint",
    );
  const password = process.env.PILOT_FIXTURE_PASSWORD;
  if (!password || password.length < 12)
    throw new Error("Set PILOT_FIXTURE_PASSWORD (at least 12 characters)");
  const db = new PrismaClient();
  try {
    if (hostedPilot && (await db.user.count({
      where: { id: { notIn: ["pilot-hr", "pilot-peer", "pilot-subject", "pilot-outsider"] } },
    })) > 0) {
      throw new Error("Hosted synthetic seed refuses a database containing other users");
    }
    const passwordHash = await bcrypt.hash(password, 10);
    for (const [id, name, role] of [
      ["pilot-hr", "Pilot HR (synthetic)", "HR"],
      ["pilot-peer", "Pilot Peer (synthetic)", "EMPLOYEE"],
      ["pilot-subject", "Pilot Subject (synthetic)", "EMPLOYEE"],
      ["pilot-outsider", "Pilot Outsider (synthetic)", "EMPLOYEE"],
    ] as const) {
      await db.user.upsert({
        where: { id },
        create: {
          id,
          name,
          email: `${id}@example.test`,
          role,
          passwordHash,
          onboardingCompleted: true,
        },
        update: { name, email: `${id}@example.test`, role, passwordHash },
      });
    }
    const date = new Date(Date.now() + 5 * 3600000).toISOString().slice(0, 10);
    await db.aiEvaluationCycle.upsert({
      where: { id: "pilot-synthetic-cycle" },
      create: {
        id: "pilot-synthetic-cycle",
        name: "Synthetic development pilot",
        startDate: cycleStart(date),
        config: syntheticConfig,
        status: "ACTIVE",
        createdById: "pilot-hr",
        activatedAt: new Date(),
      },
      update: {},
    });
    if (process.argv.includes("--demo")) {
      await db.aiEvaluationCheckIn.upsert({
        where: { id: "pilot-demo-checkin" },
        create: {
          id: "pilot-demo-checkin",
          cycleId: "pilot-synthetic-cycle",
          evaluatorId: "pilot-peer",
          evaluateeId: "pilot-subject",
          relationship: "PEER",
          competencyId: "pilot-delivery",
          week: 1,
          status: "DRAFT",
          question:
            "Describe your most recent handoff with this colleague. What was agreed, what happened, and what was the outcome?",
        },
        update: {},
      });
      const oldStart = new Date(Date.now() - 90 * 86400000);
      await db.aiEvaluationCycle.upsert({
        where: { id: "pilot-demo-quarter" },
        create: {
          id: "pilot-demo-quarter",
          name: "Synthetic completed quarter",
          startDate: oldStart,
          config: syntheticConfig,
          status: "ACTIVE",
          createdById: "pilot-hr",
          activatedAt: oldStart,
        },
        update: {},
      });
      const sourceIds = [];
      for (const week of [2, 7]) {
        const id = `pilot-demo-source-${week}`;
        const text =
          week === 2
            ? "On Monday the agreed analysis arrived by 3pm. I used it in the client meeting without asking for corrections."
            : "The scheduled handoff included the agreed documentation. I finished my review on time without requesting missing information.";
        await db.aiEvaluationCheckIn.upsert({
          where: { id },
          create: {
            id,
            cycleId: "pilot-demo-quarter",
            evaluatorId: "pilot-peer",
            evaluateeId: "pilot-subject",
            relationship: "PEER",
            competencyId: "pilot-delivery",
            week,
            status: "SUBMITTED",
            question: "Describe a recent handoff.",
            answer: text,
            submittedAt: oldStart,
          },
          update: {},
        });
        await db.aiEvaluationObservation.upsert({
          where: { id },
          create: {
            id,
            cycleId: "pilot-demo-quarter",
            checkInId: id,
            evaluateeId: "pilot-subject",
            evaluatorId: "pilot-peer",
            relationship: "PEER",
            competencyId: "pilot-delivery",
            week,
            concrete: true,
            text,
            sourceQuote: text,
            incidentKey: id,
          },
          update: {},
        });
        sourceIds.push(id);
      }
      await db.aiEvaluationArtifact.upsert({
        where: { jobId: "synthetic-fixture-assessment" },
        create: {
          id: "pilot-demo-assessment",
          cycleId: "pilot-demo-quarter",
          evaluateeId: "pilot-subject",
          kind: "ASSESSMENT",
          jobId: "synthetic-fixture-assessment",
          content: {
            ratings: [
              {
                competencyId: "pilot-delivery",
                rating: 3,
                rationale:
                  "Synthetic fixture: two independent handoffs meet the agreed expectations. There is no evidence of additional impact beyond the role.",
                sourceIds,
                conflictingSourceIds: [],
              },
            ],
            score: { overall: 3 },
          },
        },
        update: {},
      });
      await db.aiEvaluationTheme.upsert({
        where: { id: "pilot-demo-theme" },
        create: {
          id: "pilot-demo-theme",
          cycleId: "pilot-demo-quarter",
          evaluateeId: "pilot-subject",
          text: "Synthetic example: Continue documenting handoffs clearly. For the next quarter, identify one recurring source of rework and propose a measurable improvement.",
          sourceIds,
          status: "RELEASED",
          createdById: "pilot-hr",
          releasedAt: new Date(),
        },
        update: {},
      });
    }
    console.log(
      "Synthetic users and cycle ready. Accounts: pilot-hr@example.test, pilot-peer@example.test, pilot-subject@example.test, pilot-outsider@example.test. Password is your PILOT_FIXTURE_PASSWORD.",
    );
  } finally {
    await db.$disconnect();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
