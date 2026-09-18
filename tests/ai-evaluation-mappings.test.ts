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
test("individual assignments include same-department peers and exclude departmental/self rows", () => {
  const result = derivePilotAssignments(["a"], [mapping("b", "TEAM_LEAD"), mapping("b", "TEAM_LEAD"),
    mapping("c"), mapping("b", "DEPT"), mapping("a", "SELF")], people);
  assert.deepEqual(result, { assignments: [{ evaluatorId: "b", evaluateeId: "a", relationship: "TEAM_LEAD" }, { evaluatorId: "c", evaluateeId: "a", relationship: "PEER" }], issues: [] });
});
test("missing employees block assignment without inventing a relationship", () => {
  const result = derivePilotAssignments(["a"], [mapping("missing")], people);
  assert.equal(result.assignments.length, 0);
  assert.equal(result.issues.length, 2);
});
test("all three individual perspectives work inside one department", () => {
  const sameTeam = ["subject", "lead", "peer", "report"].map(id => ({ id, department: "Engineering" }));
  const rows = ["TEAM_LEAD", "PEER", "DIRECT_REPORT"].map((relationshipType, i) => ({ evaluatorId: sameTeam[i + 1].id, evaluateeId: "subject", relationshipType }));
  const result = derivePilotAssignments(["subject"], rows, sameTeam);
  assert.equal(result.assignments.length, 3);
  assert.deepEqual(result.issues, []);
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
