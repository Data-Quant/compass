import test from "node:test";
import assert from "node:assert/strict";
import {
  configSchema,
  cycleStart,
  cycleWeek,
  WEEK_MS,
  calculateScore,
  validateRatings,
  selectWeekly,
  type Evidence,
  type Rating,
  type PilotConfig,
} from "../lib/ai-evaluations/domain";
import {
  infer,
  questionOutput,
  outputSchemas,
  InferenceError,
} from "../lib/ai-evaluations/fireworks";

export const config: PilotConfig = {
  members: [
    {
      employeeId: "subject",
      expectations: "Deliver agreed work",
      weights: { PEER: 0.4, TEAM_LEAD: 0.6 },
    },
  ],
  assignments: [
    { evaluatorId: "peer", evaluateeId: "subject", relationship: "PEER" },
    { evaluatorId: "lead", evaluateeId: "subject", relationship: "TEAM_LEAD" },
  ],
  rubric: [
    {
      id: "peer-delivery",
      relationship: "PEER",
      name: "Delivery",
      anchors: [
        "Repeated missed commitments",
        "Inconsistent delivery",
        "Reliable delivery",
        "Consistently exceeds expectations with additional impact",
      ],
    },
    {
      id: "lead-delivery",
      relationship: "TEAM_LEAD",
      name: "Delivery",
      anchors: [
        "Repeated missed commitments",
        "Inconsistent delivery",
        "Reliable delivery",
        "Consistently exceeds expectations with additional impact",
      ],
    },
  ],
  weeklyBudget: 2,
  minObservations: 2,
  minWeeks: 2,
};
const evidence = (id: string, week: number, incidentKey = id): Evidence => ({
  id,
  week,
  incidentKey,
  competencyId: "peer-delivery",
  relationship: "PEER",
  concrete: true,
  text: "Delivered the agreed report",
  sourceQuote: "Delivered the agreed report",
  evaluatorId: "peer",
  evaluateeId: "subject",
  checkInId: id,
});
const rating = (
  competencyId: string,
  value: number | null,
  sourceIds: string[] = [],
): Rating => ({
  competencyId,
  rating: value,
  rationale: "Against the supplied anchor",
  sourceIds,
  conflictingSourceIds: [],
});

test("fixed lens weights determine score; missing lens is not redistributed", () => {
  assert.equal(
    calculateScore(
      [rating("peer-delivery", 4), rating("lead-delivery", 2)],
      config.rubric,
      config.members[0].weights,
    ).overall,
    2.8,
  );
  assert.equal(
    calculateScore(
      [rating("peer-delivery", 4)],
      config.rubric,
      config.members[0].weights,
    ).overall,
    null,
  );
});
test("duplicate incident across weeks cannot satisfy two-incident threshold", () => {
  const rows = [evidence("a", 1, "same"), evidence("b", 2, "same")];
  assert.equal(
    validateRatings(
      [rating("peer-delivery", 4, ["a", "b"])],
      [config.rubric[0]],
      rows,
      config,
    )[0].rating,
    null,
  );
});
test("repeated observations in one week cannot satisfy week threshold", () => {
  assert.equal(
    validateRatings(
      [rating("peer-delivery", 3, ["a", "b"])],
      [config.rubric[0]],
      [evidence("a", 1), evidence("b", 1)],
      config,
    )[0].rating,
    null,
  );
});
test("specific independent events satisfy coverage; vague praise does not", () => {
  const rows = [evidence("a", 1), evidence("b", 2)];
  assert.equal(
    validateRatings(
      [rating("peer-delivery", 4, ["a", "b"])],
      [config.rubric[0]],
      rows,
      config,
    )[0].rating,
    4,
  );
  assert.equal(
    validateRatings(
      [rating("peer-delivery", 4, ["a", "b"])],
      [config.rubric[0]],
      rows.map((e) => ({ ...e, concrete: false })),
      config,
    )[0].rating,
    null,
  );
});
test("rejects invented citations and missing competency ratings", () => {
  assert.throws(
    () =>
      validateRatings(
        [rating("peer-delivery", 3, ["invented"])],
        [config.rubric[0]],
        [],
        config,
      ),
    /reference/,
  );
  assert.throws(
    () => validateRatings([], config.rubric, [], config),
    /each competency/,
  );
});
test("configuration rejects incomplete anchors, self weights and invalid totals", () => {
  assert.ok(configSchema.safeParse(config).success);
  assert.equal(
    configSchema.safeParse({
      ...config,
      rubric: [{ ...config.rubric[0], anchors: ["", "", "", ""] }],
    }).success,
    false,
  );
  assert.equal(
    configSchema.safeParse({
      ...config,
      members: [{ ...config.members[0], weights: { SELF: 1 } }],
    }).success,
    false,
  );
  assert.equal(
    configSchema.safeParse({
      ...config,
      members: [{ ...config.members[0], weights: { PEER: 0.4 } }],
    }).success,
    false,
  );
});
test("Karachi cycle windows include twelve weeks and reject invalid calendar dates", () => {
  const start = cycleStart("2026-09-10");
  assert.equal(start.toISOString(), "2026-09-09T19:00:00.000Z");
  assert.equal(cycleWeek(start, new Date(start.getTime() - 1)), null);
  assert.equal(cycleWeek(start, start), 1);
  assert.equal(
    cycleWeek(start, new Date(start.getTime() + 12 * WEEK_MS - 1)),
    12,
  );
  assert.equal(
    cycleWeek(start, new Date(start.getTime() + 12 * WEEK_MS)),
    null,
  );
  assert.throws(() => cycleStart("2026-02-30"));
});
test("weekly budget rotates evaluatees and does not duplicate a person across lenses", () => {
  const c = {
    ...config,
    weeklyBudget: 1,
    assignments: [
      ...config.assignments,
      {
        evaluatorId: "peer",
        evaluateeId: "other",
        relationship: "PEER" as const,
      },
    ],
  };
  const first = selectWeekly(c, []);
  const second = selectWeekly(c, first);
  assert.equal(first.filter((a) => a.evaluatorId === "peer").length, 1);
  assert.notEqual(
    first.find((a) => a.evaluatorId === "peer")!.evaluateeId,
    second.find((a) => a.evaluatorId === "peer")!.evaluateeId,
  );
});
test("Fireworks adapter validates outputs and does not return provider errors or credentials", async () => {
  const oldKey = process.env.FIREWORKS_API_KEY,
    oldModel = process.env.FIREWORKS_MODEL;
  process.env.FIREWORKS_API_KEY = "synthetic-test-key";
  process.env.FIREWORKS_MODEL = "test-model";
  try {
    const ok: typeof fetch = async (_url, options) => {
      const body = JSON.parse(String(options?.body));
      assert.equal(body.response_format.type, "json_schema");
      assert.match(body.messages[0].content, /untrusted/);
      return Response.json({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                question: "Describe a recent handoff and its outcome.",
              }),
            },
          },
        ],
        usage: { total_tokens: 20 },
      });
    };
    assert.equal(
      (
        await infer(
          "question",
          "Ask neutrally.",
          {},
          questionOutput,
          outputSchemas.question,
          ok,
        )
      ).usage.total_tokens,
      20,
    );
    const bad: typeof fetch = async () =>
      Response.json({ error: "synthetic-test-key" }, { status: 429 });
    await assert.rejects(
      infer("question", "", {}, questionOutput, outputSchemas.question, bad),
      (e: unknown) =>
        e instanceof InferenceError &&
        e.code === "PROVIDER_RATE_LIMIT" &&
        !e.message.includes("synthetic-test-key"),
    );
    const malformed: typeof fetch = async () =>
      Response.json({
        choices: [
          { finish_reason: "stop", message: { content: '{"rating":4}' } },
        ],
      });
    await assert.rejects(
      infer(
        "question",
        "",
        {},
        questionOutput,
        outputSchemas.question,
        malformed,
      ),
      /INVALID_STRUCTURED_OUTPUT/,
    );
    const timeout: typeof fetch = async () => {
      throw new Error("secret network details");
    };
    await assert.rejects(
      infer(
        "question",
        "",
        {},
        questionOutput,
        outputSchemas.question,
        timeout,
      ),
      /PROVIDER_TIMEOUT_OR_NETWORK/,
    );
  } finally {
    if (oldKey === undefined) delete process.env.FIREWORKS_API_KEY;
    else process.env.FIREWORKS_API_KEY = oldKey;
    if (oldModel === undefined) delete process.env.FIREWORKS_MODEL;
    else process.env.FIREWORKS_MODEL = oldModel;
  }
});
