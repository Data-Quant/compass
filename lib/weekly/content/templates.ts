// Drafts for questions the spec did not cover (and for leads' custom questions): the
// prompts follow the spec's pattern; each level uses HR's description, falling back to the
// shared standard when HR left it blank, in which case the profile is marked incomplete.
import type { LevelKey, ProfileLevel, ProfileLevels } from '../profile'
import { STANDARD_LEVELS, type CompetencyContent } from './drafts'

export function draftFromDescriptions(input: {
  questionText: string
  descriptions: Partial<Record<LevelKey, string | null | undefined>>
}): CompetencyContent {
  const topic = input.questionText.trim()
  const keys: LevelKey[] = ['1', '2', '3', '4']
  const levelFor = (key: LevelKey): ProfileLevel => {
    const description = input.descriptions[key]?.trim()
    return { ...STANDARD_LEVELS[key], behaviours: description || STANDARD_LEVELS[key].behaviours, evidence: [] }
  }
  const levels: ProfileLevels = { '1': levelFor('1'), '2': levelFor('2'), '3': levelFor('3'), '4': levelFor('4') }
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
