import { relationships, type PilotConfig } from "./domain";

export type MappingPerson = { id: string; department: string | null };
export type PilotMapping = {
  evaluatorId: string;
  evaluateeId: string;
  relationshipType: string;
};

/** Physical mapping rows already encode direction, including mirrored relationships. */
export function derivePilotAssignments(
  employeeIds: string[],
  mappings: PilotMapping[],
  people: MappingPerson[],
) {
  const enrolled = new Set(employeeIds);
  const users = new Map(people.map(p => [p.id, p]));
  const assignments: PilotConfig["assignments"] = [];
  const issues = new Set<string>();
  const seen = new Set<string>();
  for (const m of mappings) {
    if (!enrolled.has(m.evaluateeId) || m.relationshipType === "DEPT" ||
      m.relationshipType === "SELF" || m.evaluatorId === m.evaluateeId) continue;
    const evaluator = users.get(m.evaluatorId);
    const evaluatee = users.get(m.evaluateeId);
    const from = evaluator?.department?.trim().toLowerCase();
    const to = evaluatee?.department?.trim().toLowerCase();
    if (!from || !to) {
      issues.add(`Mapping ${m.evaluatorId} → ${m.evaluateeId} needs departments for both employees.`);
      continue;
    }
    if (from === "3e" || to === "3e") continue;
    if (from === to) {
      if (m.relationshipType === "CROSS_DEPARTMENT")
        issues.add(`Cross-department mapping ${m.evaluatorId} → ${m.evaluateeId} has the same department on both sides.`);
      continue;
    }
    if (!relationships.includes(m.relationshipType as typeof relationships[number])) {
      issues.add(`Unsupported relationship for ${m.evaluatorId} → ${m.evaluateeId}.`);
      continue;
    }
    const key = `${m.evaluatorId}:${m.evaluateeId}:${m.relationshipType}`;
    if (seen.has(key)) continue;
    seen.add(key);
    assignments.push({ evaluatorId: m.evaluatorId, evaluateeId: m.evaluateeId,
      relationship: m.relationshipType as typeof relationships[number] });
  }
  assignments.sort((a, b) => assignmentKey(a).localeCompare(assignmentKey(b)));
  for (const id of enrolled) {
    if (!assignments.some(a => a.evaluateeId === id))
      issues.add(`Employee ${id} has no eligible interdepartment evaluator mapping.`);
  }
  return { assignments, issues: [...issues] };
}

function assignmentKey(a: PilotConfig["assignments"][number]) {
  return `${a.evaluatorId}:${a.evaluateeId}:${a.relationship}`;
}
export function sameAssignments(a: PilotConfig["assignments"], b: PilotConfig["assignments"]) {
  return JSON.stringify(a.map(assignmentKey).sort()) === JSON.stringify(b.map(assignmentKey).sort());
}
