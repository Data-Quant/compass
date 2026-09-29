import { z } from 'zod'

export type LevelKey = '1' | '2' | '3' | '4'
/** Highest first, as HR reads them. */
export const LEVEL_KEYS: readonly LevelKey[] = ['4', '3', '2', '1']
export const LEVEL_LABELS: Record<LevelKey, string> = {
  '4': 'Transforming The Business',
  '3': 'Exceeds Expectations',
  '2': 'Meets Expectations',
  '1': 'Does Not Meet Expectations',
}

const text = z.string().trim().min(1, 'Required').max(2000)
export const profileLevelSchema = z
  .object({ behaviours: text, consistency: text, outcome: text, evidence: z.array(z.string().trim().min(1).max(500)).max(10) })
  .strict()
export const profileLevelsSchema = z
  .object({ '1': profileLevelSchema, '2': profileLevelSchema, '3': profileLevelSchema, '4': profileLevelSchema })
  .strict()

export type ProfileLevel = z.infer<typeof profileLevelSchema>
export type ProfileLevels = z.infer<typeof profileLevelsSchema>

export function parseProfileLevels(value: unknown): ProfileLevels | null {
  const parsed = profileLevelsSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}
