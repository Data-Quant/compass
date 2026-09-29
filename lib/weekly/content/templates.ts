// Drafts for questions the spec did not cover (and for leads' custom questions): the
// prompts follow the spec's pattern; each level uses HR's description, falling back to the
// shared standard when HR left it blank, in which case the profile is marked incomplete.
import type { LevelKey, ProfileLevels } from '../profile'
import { STANDARD_LEVELS, type CompetencyContent } from './drafts'

export function draftFromDescriptions(input: {
  questionText: string
  descriptions: Partial<Record<LevelKey, string | null | undefined>>
}): CompetencyContent {
  const topic = input.questionText.trim()
  const keys: LevelKey[] = ['1', '2', '3', '4']
  const levels = Object.fromEntries(
    keys.map((key) => {
      const description = input.descriptions[key]?.trim()
      return [key, { ...STANDARD_LEVELS[key], behaviours: description || STANDARD_LEVELS[key].behaviours, evidence: [] }]
    }),
  ) as ProfileLevels
  return {
    name: topic,
    definition: topic,
    prompts: {
      A: `Think of a recent, specific situation that shows “${topic}”. What was going on, what did they do, and what happened as a result?`,
      B: `Describe a time “${topic}” fell short of what you expected. What was missing, and how did they respond?`,
    },
    levels,
    incomplete: keys.some((key) => !input.descriptions[key]?.trim()),
  }
}
