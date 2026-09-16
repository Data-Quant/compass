import test from "node:test";
import assert from "node:assert/strict";
import { syntheticConfig } from "./fixtures/ai-evaluation-cases";

test(
  "pilot persistence, concurrency, source validation and retries",
  { skip: process.env.PILOT_DB_TEST !== "true" },
  async () => {
    const url = new URL(process.env.DATABASE_URL || "");
    assert.ok(
      ["127.0.0.1", "localhost"].includes(url.hostname) &&
        url.pathname === "/compass_ai_pilot",
      "Use an isolated synthetic database",
    );
    const { prisma } = await import("../lib/db");
    const { saveCycle, activate, scheduleDue, saveAnswer, enqueue } =
      await import("../lib/ai-evaluations/service");
    const { runOneJob } = await import("../lib/ai-evaluations/worker");
    const originalFetch = globalThis.fetch;
    const id = `integration-${Date.now()}`;
    process.env.FIREWORKS_API_KEY = "synthetic-key";
    process.env.FIREWORKS_MODEL = "synthetic-model";
    try {
      for (const userId of ["pilot-peer", "pilot-subject", "pilot-hr"])
        await prisma.user.upsert({
          where: { id: userId },
          create: { id: userId, name: "Synthetic fixture", department: userId === "pilot-subject" ? "Finance" : "Operations" },
          update: { department: userId === "pilot-subject" ? "Finance" : "Operations" },
        });
      await prisma.evaluatorMapping.deleteMany({ where: { evaluateeId: "pilot-subject" } });
      await prisma.evaluatorMapping.create({ data: {
        evaluatorId: "pilot-peer", evaluateeId: "pilot-subject", relationshipType: "PEER",
      } });
      const cycle = await saveCycle(
        {
          name: id,
          startDate: new Date(Date.now() + 5 * 3600000)
            .toISOString()
            .slice(0, 10),
          config: { ...syntheticConfig, assignments: [] },
        },
        "pilot-hr",
      );
      assert.deepEqual((cycle.config as unknown as typeof syntheticConfig).assignments, syntheticConfig.assignments);
      const added = await prisma.evaluatorMapping.create({ data: {
        evaluatorId: "pilot-hr", evaluateeId: "pilot-subject", relationshipType: "PEER",
      } });
      await assert.rejects(activate(cycle.id, cycle.revision), /mappings changed/);
      await prisma.evaluatorMapping.delete({ where: { id: added.id } });
      await activate(cycle.id, cycle.revision);
      await prisma.evaluatorMapping.deleteMany({ where: { evaluateeId: "pilot-subject" } });
      await assert.rejects(
        saveCycle(
          {
            id: cycle.id,
            revision: 1,
            name: "Changed",
            startDate: "2026-09-10",
            config: syntheticConfig,
          },
          "pilot-hr",
        ),
        /already active/,
      );
      await Promise.all([scheduleDue(), scheduleDue()]);
      const rows = await prisma.aiEvaluationCheckIn.findMany({
        where: { cycleId: cycle.id },
      });
      assert.equal(rows.length, 1);
      const row = rows[0];
      await assert.rejects(
        saveAnswer(
          {
            id: row.id,
            revision: 0,
            action: "submit",
            answer: "A report was delivered Monday.",
            clarificationAnswer: "",
            noInteraction: false,
          },
          "outsider",
        ),
        /not found/,
      );
      // Isolate worker candidates from any interactive synthetic demo jobs.
      await prisma.aiEvaluationJob.updateMany({
        where: { cycleId: { not: cycle.id }, status: "PENDING" },
        data: { runAfter: new Date(Date.now() + 3600000) },
      });
      globalThis.fetch = async () =>
        Response.json({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({
                  question: "Describe the last handoff and its outcome.",
                }),
              },
            },
          ],
          usage: { total_tokens: 10 },
        });
      const concurrent = await Promise.all([runOneJob(), runOneJob()]);
      assert.equal(
        concurrent.filter((r) => r.status === "SUCCEEDED").length,
        1,
      );
      const answer = {
        id: row.id,
        revision: 0,
        action: "save" as const,
        answer:
          "On Monday the report arrived on time and I used it in the meeting.",
        clarificationAnswer: "",
        noInteraction: false,
      };
      await saveAnswer(answer, "pilot-peer");
      await assert.rejects(saveAnswer(answer, "pilot-peer"), /another tab/);
      await saveAnswer(
        { ...answer, revision: 1, action: "submit" },
        "pilot-peer",
      );
      await assert.rejects(
        saveAnswer({ ...answer, revision: 2 }, "pilot-peer"),
        /cannot be edited/,
      );
      assert.equal(
        (
          await prisma.aiEvaluationCheckIn.findUniqueOrThrow({
            where: { id: row.id },
          })
        ).history instanceof Array,
        true,
      );
      globalThis.fetch = async () =>
        Response.json({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({
                  observations: [
                    {
                      text: "Fabricated",
                      sourceQuote: "This was never said",
                      concrete: true,
                      existingIncidentKey: null,
                    },
                  ],
                }),
              },
            },
          ],
        });
      assert.equal((await runOneJob()).status, "PENDING");
      assert.equal(
        await prisma.aiEvaluationObservation.count({
          where: { checkInId: row.id },
        }),
        0,
      );
      const extract = await prisma.aiEvaluationJob.findUniqueOrThrow({
        where: { key: `extraction:${row.id}` },
      });
      await prisma.aiEvaluationJob.update({
        where: { id: extract.id },
        data: { runAfter: new Date() },
      });
      globalThis.fetch = async () =>
        Response.json({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({
                  observations: [
                    {
                      text: answer.answer,
                      sourceQuote: answer.answer,
                      concrete: true,
                      existingIncidentKey: null,
                    },
                  ],
                }),
              },
            },
          ],
        });
      assert.equal((await runOneJob()).status, "SUCCEEDED");
      assert.equal(
        await prisma.aiEvaluationObservation.count({
          where: { checkInId: row.id },
        }),
        1,
      );
      await enqueue(prisma, cycle, "extraction", `extraction:${row.id}`, {
        checkInId: row.id,
      });
      assert.equal(
        await prisma.aiEvaluationJob.count({
          where: { key: `extraction:${row.id}` },
        }),
        1,
      );
      // Fabricated profile citations must never persist.
      globalThis.fetch = async () =>
        Response.json({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({
                  claims: [
                    {
                      relationship: "PEER",
                      type: "strength",
                      text: "Invented",
                      sourceIds: ["unknown"],
                    },
                  ],
                }),
              },
            },
          ],
        });
      assert.equal((await runOneJob()).status, "PENDING");
      assert.equal(
        await prisma.aiEvaluationArtifact.count({
          where: { cycleId: cycle.id },
        }),
        0,
      );
      const profile = await prisma.aiEvaluationJob.findFirstOrThrow({ where: { cycleId: cycle.id, operation: 'profile' } });
      for (const expected of ['PENDING', 'FAILED']) {
        await prisma.aiEvaluationJob.update({ where: { id: profile.id }, data: { runAfter: new Date() } });
        assert.equal((await runOneJob()).status, expected);
      }
      assert.equal((await prisma.aiEvaluationJob.findUniqueOrThrow({ where: { id: profile.id } })).attempts, 3);
      assert.equal((await runOneJob()).status, 'IDLE');
      // A dead worker lease is recovered; missing configuration fails safely.
      await prisma.aiEvaluationJob.update({ where: { id: profile.id }, data: { status: 'RUNNING', attempts: 1, leaseToken: 'expired-worker', leaseUntil: new Date(0), runAfter: new Date(0) } });
      delete process.env.FIREWORKS_API_KEY;
      assert.equal((await runOneJob()).status, 'FAILED');
      assert.equal((await prisma.aiEvaluationJob.findUniqueOrThrow({ where: { id: profile.id } })).error, 'INFERENCE_NOT_CONFIGURED');
      assert.equal(await prisma.aiEvaluationArtifact.count({ where: { cycleId: cycle.id } }), 0);
    } finally {
      globalThis.fetch = originalFetch;
      const cycles = await prisma.aiEvaluationCycle.findMany({
        where: { name: id },
      });
      for (const cycle of cycles) {
        await prisma.aiEvaluationReview.deleteMany({
          where: { cycleId: cycle.id },
        });
        await prisma.aiEvaluationTheme.deleteMany({
          where: { cycleId: cycle.id },
        });
        await prisma.aiEvaluationArtifact.deleteMany({
          where: { cycleId: cycle.id },
        });
        await prisma.aiEvaluationObservation.deleteMany({
          where: { cycleId: cycle.id },
        });
        await prisma.aiEvaluationJob.deleteMany({
          where: { cycleId: cycle.id },
        });
        await prisma.aiEvaluationCheckIn.deleteMany({
          where: { cycleId: cycle.id },
        });
        await prisma.aiEvaluationCycle.delete({ where: { id: cycle.id } });
      }
      await prisma.$disconnect();
    }
  },
);
