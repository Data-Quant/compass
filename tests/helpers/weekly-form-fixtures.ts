import type { PrismaClient, RelationshipType } from '@prisma/client'
import { W, type WeeklyTestPerson } from './weekly-test-db'

/** Fictional form evaluators. The C-Level evaluator is deliberately not exempt from the 4s cap (not Hamiz, not a Partner). */
export const F = {
  chief: { id: 'wkt-chief', name: 'Cyrus Vale', role: 'EMPLOYEE', position: 'Chief Executive', department: 'Leadership' },
  hr2: { id: 'wkt-hr2', name: 'Hugo Brandt', role: 'HR', position: 'HR Executive', department: 'Human Resources' },
} satisfies Record<string, WeeklyTestPerson>

/** orderIndex from 950 keeps these apart from real rows; the weekly reset deletes everything from 900. */
export const FORM_BANK: Array<{ relationshipType: 'C_LEVEL' | 'DEPT' | 'HR'; questionText: string; questionType: 'RATING' | 'TEXT' }> = [
  { relationshipType: 'C_LEVEL', questionText: 'Strategic contribution', questionType: 'RATING' },
  { relationshipType: 'C_LEVEL', questionText: 'Ownership', questionType: 'RATING' },
  { relationshipType: 'C_LEVEL', questionText: 'Client impact', questionType: 'RATING' },
  { relationshipType: 'C_LEVEL', questionText: 'Comments for the person', questionType: 'TEXT' },
  { relationshipType: 'DEPT', questionText: 'Contribution to the department', questionType: 'RATING' },
  { relationshipType: 'DEPT', questionText: 'Department culture', questionType: 'RATING' },
  { relationshipType: 'HR', questionText: 'Policy adherence', questionType: 'RATING' },
  { relationshipType: 'HR', questionText: 'Attendance and punctuality', questionType: 'RATING' },
]

/** C-Level and Department forms from the chief for Ana and Ben (both in Product: one department form); HR forms for Ana from two HR people. */
export async function seedFormFixtures(db: PrismaClient): Promise<void> {
  for (const person of Object.values(F)) {
    await db.user.create({ data: { ...person, email: `${person.id}@example.test`, onboardingCompleted: true } })
  }
  const mappings: Array<[string, string, RelationshipType]> = [
    [F.chief.id, W.ana.id, 'C_LEVEL'], [F.chief.id, W.ben.id, 'C_LEVEL'],
    [F.chief.id, W.ana.id, 'DEPT'], [F.chief.id, W.ben.id, 'DEPT'],
    [W.hr.id, W.ana.id, 'HR'], [F.hr2.id, W.ana.id, 'HR'],
  ]
  for (const [evaluatorId, evaluateeId, relationshipType] of mappings) {
    await db.evaluatorMapping.create({ data: { evaluatorId, evaluateeId, relationshipType } })
  }
  for (const [index, question] of FORM_BANK.entries()) {
    await db.evaluationQuestion.create({ data: { ...question, orderIndex: 950 + index } })
  }
}
