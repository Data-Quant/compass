import { prisma } from '@/lib/db'
import type { PersonFacts } from '../eligibility'
import { redactNames } from '../redact'
import { loadPeople } from './context'
import type { Db } from './db'

export interface Redactor { redact: (text: string) => string; evaluatee: PersonFacts | null }

/** D15: before text leaves Compass, the evaluator becomes "the evaluator" and the person "the person". */
export async function redactorFor(evaluatorId: string, evaluateeId: string, db: Db = prisma): Promise<Redactor> {
  const people = await loadPeople([evaluatorId, evaluateeId], db)
  const names = [
    { name: people.get(evaluatorId)?.name ?? '', placeholder: 'the evaluator' },
    { name: people.get(evaluateeId)?.name ?? '', placeholder: 'the person' },
  ].filter((n) => n.name.trim())
  return { redact: (text: string) => redactNames(text, names), evaluatee: people.get(evaluateeId) ?? null }
}
