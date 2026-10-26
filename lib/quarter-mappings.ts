// A quarter's mappings, for auditing: who evaluated whom, how, and where each pair came from. A quarter that is locked,
// or whose weekly round has closed, shows the mappings saved then; any other quarter shows what it would use today.
import { prisma } from '@/lib/db'
import { getResolvedEvaluationAssignments, usesSavedAssignments, type AssignmentSource } from '@/lib/evaluation-assignments'
import type { RelationshipType } from '@/types'

export interface QuarterMappingPerson { id: string; name: string; department: string | null }
export interface QuarterMappingRow { evaluator: QuarterMappingPerson; evaluatee: QuarterMappingPerson; relationshipType: RelationshipType; source: AssignmentSource }
export interface QuarterMappingsView {
  quarters: Array<{ id: string; name: string }>
  quarter: { id: string; name: string; startDate: string; endDate: string } | null
  /** `saved`: fixed when the quarter's round closed or it was locked. `live`: today's mappings, which can still change. */
  state: { kind: 'saved' | 'live'; savedAt: string | null }
  rows: QuarterMappingRow[]
}

const person = (p: { id: string; name: string; department: string | null } | undefined, id: string): QuarterMappingPerson =>
  p ? { id: p.id, name: p.name, department: p.department } : { id, name: 'Unknown person', department: null }

/** The quarter's mappings (the newest quarter when none is chosen), with every quarter to choose from. */
export async function quarterMappings(periodId?: string): Promise<QuarterMappingsView> {
  const quarters = await prisma.evaluationPeriod.findMany({ orderBy: { startDate: 'desc' }, select: { id: true, name: true, startDate: true, endDate: true } })
  const quarter = (periodId ? quarters.find((q) => q.id === periodId) : quarters[0]) ?? null
  if (!quarter) return { quarters: [], quarter: null, state: { kind: 'live', savedAt: null }, rows: [] }

  const saved = await usesSavedAssignments(quarter.id)
  const savedRows = saved ? await prisma.evaluationPeriodAssignmentSnapshot.aggregate({ where: { periodId: quarter.id }, _max: { createdAt: true }, _count: true }) : null
  // A quarter locked before saving existed has no saved rows and still reads today's mappings.
  const isSaved = Boolean(savedRows && savedRows._count > 0)
  const assignments = await getResolvedEvaluationAssignments(quarter.id, { includeUsers: true })
  const rows = assignments
    .map((a) => ({ evaluator: person(a.evaluator ?? undefined, a.evaluatorId), evaluatee: person(a.evaluatee ?? undefined, a.evaluateeId), relationshipType: a.relationshipType as RelationshipType, source: a.source }))
    .sort((a, b) => a.evaluatee.name.localeCompare(b.evaluatee.name) || a.relationshipType.localeCompare(b.relationshipType) || a.evaluator.name.localeCompare(b.evaluator.name))

  return {
    quarters: quarters.map((q) => ({ id: q.id, name: q.name })),
    quarter: { id: quarter.id, name: quarter.name, startDate: quarter.startDate.toISOString(), endDate: quarter.endDate.toISOString() },
    state: { kind: isSaved ? 'saved' : 'live', savedAt: isSaved ? savedRows?._max.createdAt?.toISOString() ?? null : null },
    rows,
  }
}
