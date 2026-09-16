import test from "node:test";
import assert from "node:assert/strict";
import { derivePilotAssignments, sameAssignments } from "../lib/ai-evaluations/mappings";
const people = [
  { id: "a", department: "Finance" },
  { id: "b", department: "Engineering" },
  { id: "c", department: " finance " },
  { id: "d", department: null },
];
const mapping = (evaluatorId: string, relationshipType = "PEER") =>
  ({ evaluatorId, evaluateeId: "a", relationshipType });
test("mapped interdepartment assignments preserve direction and exclude departmental/self rows", () => {
  const result = derivePilotAssignments(["a"], [mapping("b", "TEAM_LEAD"), mapping("b", "TEAM_LEAD"),
    mapping("c"), mapping("b", "DEPT"), mapping("a", "SELF")], people);
  assert.deepEqual(result, { assignments: [{ evaluatorId: "b", evaluateeId: "a", relationship: "TEAM_LEAD" }], issues: [] });
});
test("missing and inconsistent department mappings surface actionable blockers", () => {
  const result = derivePilotAssignments(["a"], [mapping("d"), mapping("c", "CROSS_DEPARTMENT")], people);
  assert.equal(result.assignments.length, 0);
  assert.equal(result.issues.length, 3);
});
test("unmapped cohort members are flagged and no evaluator is invented", () => {
  assert.equal(derivePilotAssignments(["a"], [], people).issues.length, 1);
  assert.deepEqual(derivePilotAssignments([], [mapping("b")], people).assignments, []);
});
test("mapping comparison ignores row order but detects changed direction and relationship", () => {
  const a = derivePilotAssignments(["a"], [mapping("b")], people).assignments;
  assert.ok(sameAssignments(a, [...a].reverse()));
  assert.ok(!sameAssignments(a, [{ ...a[0], relationship: "DIRECT_REPORT" }]));
  assert.ok(!sameAssignments(a, []));
});
