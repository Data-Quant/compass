// §3 Audience: whole company, departments, teams (TeamTag) or individuals,
// with exclusions, resolved against the Compass employee directory.
import { z } from 'zod'

export const audienceSchema = z
  .object({
    all: z.boolean().default(false),
    departments: z.array(z.string().trim().min(1).max(200)).max(100).default([]),
    teams: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
    userIds: z.array(z.string().min(1).max(64)).max(2000).default([]),
    excludeUserIds: z.array(z.string().min(1).max(64)).max(2000).default([]),
  })
  .strict()

export type AudienceRules = z.infer<typeof audienceSchema>

export const EMPTY_AUDIENCE: AudienceRules = { all: false, departments: [], teams: [], userIds: [], excludeUserIds: [] }

export interface DirectoryPerson {
  id: string
  department: string | null
  teamTag: string | null
  active: boolean
}

const norm = (value: string | null) => (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

export function parseAudience(raw: unknown): AudienceRules {
  const parsed = audienceSchema.safeParse(raw)
  return parsed.success ? parsed.data : EMPTY_AUDIENCE
}

export function isAudienceEmpty(rules: AudienceRules): boolean {
  return !rules.all && rules.departments.length === 0 && rules.teams.length === 0 && rules.userIds.length === 0
}

export function isInAudience(rules: AudienceRules, person: DirectoryPerson): boolean {
  if (!person.active || rules.excludeUserIds.includes(person.id)) return false
  if (rules.all || rules.userIds.includes(person.id)) return true
  if (rules.departments.some((department) => norm(department) === norm(person.department))) return true
  return person.teamTag !== null && rules.teams.includes(person.teamTag)
}

/** Ids of active people in scope, sorted for determinism. */
export function resolveAudience(rules: AudienceRules, people: readonly DirectoryPerson[]): string[] {
  return people.filter((person) => isInAudience(rules, person)).map((person) => person.id).sort()
}
