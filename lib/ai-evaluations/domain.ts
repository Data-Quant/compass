import { z } from "zod";

export const relationships = [
  "TEAM_LEAD",
  "DIRECT_REPORT",
  "PEER",
  "C_LEVEL",
  "CROSS_DEPARTMENT",
  "HR",
  "DEPT",
  "SELF",
] as const;
export const lensSchema = z.enum(relationships);
const baselineSchema = z.object({
  position: z.string().nullable(),
  department: z.string().nullable(),
  source: z.literal("COMPASS_EMPLOYEE_RECORD"),
}).strict();
export const rubricSchema = z
  .object({
    id: z.string().min(1).max(120),
    relationship: lensSchema,
    name: z.string().trim().min(1).max(500),
    anchors: z.tuple([
      z.string().trim().min(1),
      z.string().trim().min(1),
      z.string().trim().min(1),
      z.string().trim().min(1),
    ]),
  })
  .strict();
export const configSchema = z
  .object({
    members: z
      .array(
        z
          .object({
            employeeId: z.string().min(1),
            baseline: baselineSchema.optional(),
            expectations: z.string().trim().min(1).max(4000),
            weights: z.record(z.number().min(0).max(1)),
          })
          .strict(),
      )
      .min(1)
      .max(500),
    assignments: z
      .array(
        z
          .object({
            evaluatorId: z.string().min(1),
            evaluateeId: z.string().min(1),
            relationship: lensSchema,
          })
          .strict(),
      )
      .min(1)
      .max(5000),
    rubric: z.array(rubricSchema).min(1).max(200),
    weeklyBudget: z.number().int().min(1).max(5).default(2),
    minObservations: z.number().int().min(2).max(12).default(2),
    minWeeks: z.number().int().min(2).max(12).default(2),
  })
  .strict()
  .superRefine((c, ctx) => {
    const error = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (new Set(c.members.map((m) => m.employeeId)).size !== c.members.length)
      error("Duplicate cohort member");
    if (new Set(c.rubric.map((r) => r.id)).size !== c.rubric.length)
      error("Duplicate competency ID");
    const keys = c.assignments.map(
      (a) => `${a.evaluatorId}:${a.evaluateeId}:${a.relationship}`,
    );
    if (new Set(keys).size !== keys.length) error("Duplicate assignment");
    for (const a of c.assignments) {
      if (!c.members.some((m) => m.employeeId === a.evaluateeId))
        error("Every evaluatee must be enrolled");
      if ((a.relationship === "SELF") !== (a.evaluatorId === a.evaluateeId))
        error("Only SELF assignments may evaluate oneself");
      if (!c.rubric.some((r) => r.relationship === a.relationship))
        error(`Missing rubric for ${a.relationship}`);
    }
    for (const m of c.members) {
      if (
        Math.abs(Object.values(m.weights).reduce((s, w) => s + w, 0) - 1) >
        0.000001
      )
        error("Member weights must sum to one");
      for (const [lens, weight] of Object.entries(m.weights)) {
        if (!relationships.includes(lens as (typeof relationships)[number]))
          error("Unknown relationship weight");
        if (lens === "SELF" && weight !== 0) error("SELF weight must be zero");
        if (
          weight > 0 &&
          !c.assignments.some(
            (a) => a.evaluateeId === m.employeeId && a.relationship === lens,
          )
        )
          error(`Missing assignment for weighted ${lens}`);
      }
      for (const a of c.assignments.filter(
        (a) => a.evaluateeId === m.employeeId,
      )) {
        if (!(a.relationship in m.weights))
          error(
            "Explicitly configure each assigned relationship weight (including zero)",
          );
      }
    }
  });
export type PilotConfig = z.infer<typeof configSchema>;
export type Rubric = z.infer<typeof rubricSchema>;

// Drafts may be incomplete, but retain the same safe shape used by the editor.
export const draftConfigSchema = z
  .object({
    members: z
      .array(
        z
          .object({
            employeeId: z.string(),
            baseline: baselineSchema.optional(),
            expectations: z.string().max(4000),
            weights: z.record(z.number().min(0).max(1)),
          })
          .strict(),
      )
      .max(500),
    assignments: z
      .array(
        z
          .object({
            evaluatorId: z.string(),
            evaluateeId: z.string(),
            relationship: lensSchema,
          })
          .strict(),
      )
      .max(5000),
    rubric: z
      .array(
        rubricSchema.extend({
          name: z.string().max(500),
          anchors: z.tuple([
            z.string().max(4000),
            z.string().max(4000),
            z.string().max(4000),
            z.string().max(4000),
          ]),
        }),
      )
      .max(200),
    weeklyBudget: z.number().int().min(1).max(5),
    minObservations: z.number().int().min(2).max(12),
    minWeeks: z.number().int().min(2).max(12),
  })
  .strict();

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export function cycleStart(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error("Use a YYYY-MM-DD start date");
  const result = new Date(`${date}T00:00:00+05:00`);
  if (
    !Number.isFinite(result.getTime()) ||
    new Date(result.getTime() + 5 * 3600000).toISOString().slice(0, 10) !== date
  )
    throw new Error("Invalid start date");
  return result;
}
export function cycleWeek(start: Date, now = new Date()) {
  const week = Math.floor((now.getTime() - start.getTime()) / WEEK_MS) + 1;
  return week >= 1 && week <= 12 ? week : null;
}
export interface Evidence {
  id: string;
  competencyId: string;
  relationship: string;
  incidentKey: string;
  week: number;
  concrete: boolean;
  text: string;
  sourceQuote: string;
  checkInId: string;
  evaluatorId: string;
  evaluateeId: string;
}
export function coverage(evidence: Evidence[], competencyId: string) {
  const rows = evidence.filter(
    (e) => e.competencyId === competencyId && e.concrete,
  );
  return {
    incidents: new Set(rows.map((e) => e.incidentKey)).size,
    weeks: new Set(rows.map((e) => e.week)).size,
  };
}
export const ratingSchema = z
  .object({
    competencyId: z.string(),
    rating: z.number().int().min(1).max(4).nullable(),
    rationale: z.string().min(1).max(4000),
    sourceIds: z.array(z.string()).max(100),
    conflictingSourceIds: z.array(z.string()).max(100),
  })
  .strict();
export type Rating = z.infer<typeof ratingSchema>;
export function validateRatings(
  ratings: Rating[],
  rubric: Rubric[],
  evidence: Evidence[],
  config: Pick<PilotConfig, "minWeeks" | "minObservations">,
): Rating[] {
  if (
    ratings.length !== rubric.length ||
    new Set(ratings.map((r) => r.competencyId)).size !== rubric.length
  )
    throw new Error("Assessment must cover each competency exactly once");
  return ratings.map((r) => {
    if (!rubric.some((c) => c.id === r.competencyId))
      throw new Error("Unknown competency");
    const ids = [...r.sourceIds, ...r.conflictingSourceIds];
    if (
      ids.some(
        (id) =>
          !evidence.some(
            (e) => e.id === id && e.competencyId === r.competencyId,
          ),
      )
    )
      throw new Error("Invalid evidence reference");
    const supporting = evidence.filter((e) => r.sourceIds.includes(e.id));
    const c = coverage(supporting, r.competencyId);
    if (
      r.rating !== null &&
      (c.incidents < config.minObservations || c.weeks < config.minWeeks)
    ) {
      return {
        ...r,
        rating: null,
        rationale: `Insufficient evidence: requires ${config.minObservations} distinct concrete incidents across ${config.minWeeks} weeks. ${r.rationale}`,
      };
    }
    return r;
  });
}
export function calculateScore(
  ratings: Rating[],
  rubric: Rubric[],
  weights: Record<string, number>,
) {
  const lenses: Record<string, number | null> = {};
  let total = 0,
    complete = true;
  for (const [lens, weight] of Object.entries(weights)) {
    const criteria = rubric.filter((c) => c.relationship === lens);
    const values = criteria.map(
      (c) => ratings.find((r) => r.competencyId === c.id)?.rating ?? null,
    );
    lenses[lens] =
      values.length && values.every((v) => v !== null)
        ? values.reduce<number>((s, v) => s + (v ?? 0), 0) / values.length
        : null;
    if (weight > 0 && lens !== "SELF") {
      if (lenses[lens] === null) complete = false;
      else total += lenses[lens]! * weight;
    }
  }
  return { lenses, overall: complete ? Math.round(total * 100) / 100 : null };
}

/** Coverage counts schedule attempts, so skipped and unfinished assignments also rotate. */
export function selectWeekly(
  config: PilotConfig,
  history: Array<{
    evaluatorId: string;
    evaluateeId: string;
    relationship: string;
    competencyId: string;
  }>,
  observations: Evidence[] = [],
) {
  const selected: Array<
    PilotConfig["assignments"][number] & { competencyId: string }
  > = [];
  for (const evaluatorId of [
    ...new Set(config.assignments.map((a) => a.evaluatorId)),
  ].sort()) {
    const candidates = config.assignments
      .filter((a) => a.evaluatorId === evaluatorId)
      .map((a) => {
        const pairHistory = history.filter(
          (h) =>
            h.evaluatorId === a.evaluatorId &&
            h.evaluateeId === a.evaluateeId &&
            h.relationship === a.relationship,
        );
        const employeeEvidence = observations.filter(
          (e) => e.evaluateeId === a.evaluateeId,
        );
        const priority = (id: string) => {
          const c = coverage(employeeEvidence, id);
          // Once all criteria have been asked, prefer evidence gaps without repeatedly
          // targeting the same person: pair rotation remains the outer budget rule.
          return (
            (c.incidents >= config.minObservations && c.weeks >= config.minWeeks
              ? 10000
              : 0) + pairHistory.filter((h) => h.competencyId === id).length
          );
        };
        const rubric = config.rubric
          .filter((r) => r.relationship === a.relationship)
          .sort(
            (a, b) =>
              priority(a.id) - priority(b.id) || a.id.localeCompare(b.id),
          );
        return { ...a, competencyId: rubric[0].id, count: pairHistory.length };
      })
      .sort(
        (a, b) =>
          a.count - b.count ||
          a.evaluateeId.localeCompare(b.evaluateeId) ||
          a.relationship.localeCompare(b.relationship),
      );
    const people = new Set<string>();
    for (const c of candidates) {
      if (people.has(c.evaluateeId)) continue;
      if (people.size >= config.weeklyBudget) break;
      people.add(c.evaluateeId);
      const { count, ...assignment } = c;
      selected.push(assignment);
    }
  }
  return selected;
}
