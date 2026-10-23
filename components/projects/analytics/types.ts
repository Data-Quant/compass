import type { AnalyticsRange, buildPersonAnalytics, buildProjectAnalytics } from '@/lib/project-analytics'

export type ProjectAnalytics = ReturnType<typeof buildProjectAnalytics>
type PersonCore = ReturnType<typeof buildPersonAnalytics>

// Shape of GET /api/projects/[id]/analytics after the route adds project names.
export type PersonAnalytics = Omit<PersonCore, 'byProject' | 'recent'> & {
  userId: string
  byProject: Array<{ projectId: string | null; name: string; color: string | null; count: number }>
  recent: Array<PersonCore['recent'][number] & { projectName: string }>
}

export type AnalyticsResponse = {
  project: { id: string; name: string; color: string | null }
  range: AnalyticsRange
  analytics: ProjectAnalytics
  person: PersonAnalytics | null
}

export type Participant = { id: string; name: string }
export type DoneSectionIds = Set<string>
