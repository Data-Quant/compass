import type { TaskSection, TaskStatus } from '@prisma/client'
import { prisma } from '@/lib/db'

type StatusSectionFields = Pick<TaskSection, 'id' | 'name' | 'color' | 'canonicalStatus' | 'isDefault' | 'isDone' | 'isBacklog' | 'orderIndex'>

type DefaultStatusDefinition = {
  name: string
  color: string
  canonicalStatus: TaskStatus
  isDone: boolean
  isBacklog: boolean
  orderIndex: number
  aliases: string[]
}

const DEFAULT_STATUS_SECTIONS: DefaultStatusDefinition[] = [
  {
    name: 'Backlog',
    color: '#64748b',
    canonicalStatus: 'TODO',
    isDone: false,
    isBacklog: true,
    orderIndex: 0,
    aliases: ['backlog'],
  },
  {
    name: 'To Do',
    color: '#94a3b8',
    canonicalStatus: 'TODO',
    isDone: false,
    isBacklog: false,
    orderIndex: 1,
    aliases: ['todo'],
  },
  {
    name: 'In Progress',
    color: '#60a5fa',
    canonicalStatus: 'IN_PROGRESS',
    isDone: false,
    isBacklog: false,
    orderIndex: 2,
    aliases: ['inprogress', 'doing'],
  },
  {
    name: 'Done',
    color: '#22c55e',
    canonicalStatus: 'DONE',
    isDone: true,
    isBacklog: false,
    orderIndex: 3,
    aliases: ['done', 'complete', 'completed'],
  },
]

const CUSTOM_STATUS_COLORS = [
  '#a78bfa',
  '#f59e0b',
  '#f97316',
  '#14b8a6',
  '#f43f5e',
  '#8b5cf6',
]

export function normalizeStatusName(name: string | null | undefined) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function getDefaultStatusDefinition(nameOrStatus: string | null | undefined) {
  const normalized = normalizeStatusName(nameOrStatus)
  const namedDefinition = DEFAULT_STATUS_SECTIONS.find((definition) => (
    definition.aliases.includes(normalized) ||
    normalizeStatusName(definition.name) === normalized
  ))

  if (namedDefinition) return namedDefinition

  // Backlog intentionally shares TODO's canonical status, so status-only
  // resolution must continue to point at the active To Do section.
  return (
    DEFAULT_STATUS_SECTIONS.find((definition) => (
      !definition.isBacklog && definition.canonicalStatus === nameOrStatus
    )) ||
    DEFAULT_STATUS_SECTIONS.find((definition) => definition.canonicalStatus === nameOrStatus)
  )
}

export function getStatusSectionDefaults(name: string, orderIndex = 0) {
  const defaultDefinition = getDefaultStatusDefinition(name)
  if (defaultDefinition) {
    return {
      color: defaultDefinition.color,
      canonicalStatus: defaultDefinition.canonicalStatus,
      isDefault: true,
      isDone: defaultDefinition.isDone,
      isBacklog: defaultDefinition.isBacklog,
    }
  }

  return {
    color: CUSTOM_STATUS_COLORS[orderIndex % CUSTOM_STATUS_COLORS.length],
    canonicalStatus: 'IN_PROGRESS' as TaskStatus,
    isDefault: false,
    isDone: false,
    isBacklog: false,
  }
}

export function isDoneTaskSection(section: Pick<TaskSection, 'canonicalStatus' | 'isDone'> | null | undefined) {
  return Boolean(section?.isDone || section?.canonicalStatus === 'DONE')
}

export function getTaskStatusForSection(section: Pick<TaskSection, 'canonicalStatus' | 'isDone'>) {
  return isDoneTaskSection(section) ? 'DONE' : section.canonicalStatus
}

export function selectPreferredStatusSection(
  sections: StatusSectionFields[],
  status: TaskStatus
) {
  return (
    sections.find((section) => section.isDefault && !section.isBacklog && section.canonicalStatus === status) ||
    sections.find((section) => !section.isBacklog && section.canonicalStatus === status) ||
    sections.find((section) => section.isDefault && section.canonicalStatus === status) ||
    sections.find((section) => section.canonicalStatus === status) ||
    null
  )
}

export function findExistingDefaultStatusSection(
  sections: StatusSectionFields[],
  definition: DefaultStatusDefinition,
  claimedIds: ReadonlySet<string> = new Set()
) {
  const available = sections.filter((section) => !claimedIds.has(section.id))
  const canonicalName = normalizeStatusName(definition.name)

  return (
    available.find((section) => normalizeStatusName(section.name) === canonicalName) ||
    available.find((section) => definition.aliases.includes(normalizeStatusName(section.name))) ||
    available.find((section) => definition.isBacklog && section.isBacklog) ||
    available.find((section) => (
      section.isDefault &&
      !section.isBacklog &&
      !definition.isBacklog &&
      normalizeStatusName(section.name) !== 'backlog' &&
      section.canonicalStatus === definition.canonicalStatus &&
      section.isDone === definition.isDone
    )) ||
    null
  )
}

export async function ensureProjectStatusSections(projectId: string): Promise<StatusSectionFields[]> {
  const existingSections = await prisma.taskSection.findMany({
    where: { projectId },
    orderBy: { orderIndex: 'asc' },
  })

  const claimedDefaultIds = new Set<string>()
  let changed = false

  for (const definition of DEFAULT_STATUS_SECTIONS) {
    const existing = findExistingDefaultStatusSection(existingSections, definition, claimedDefaultIds)

    if (!existing) {
      const created = await prisma.taskSection.create({
        data: {
          projectId,
          name: definition.name,
          color: definition.color,
          canonicalStatus: definition.canonicalStatus,
          isDefault: true,
          isDone: definition.isDone,
          isBacklog: definition.isBacklog,
          orderIndex: definition.orderIndex,
        },
      })
      claimedDefaultIds.add(created.id)
      changed = true
      continue
    }

    claimedDefaultIds.add(existing.id)

    if (
      existing.name !== definition.name ||
      existing.canonicalStatus !== definition.canonicalStatus ||
      existing.isDefault !== true ||
      existing.isDone !== definition.isDone ||
      existing.isBacklog !== definition.isBacklog ||
      !existing.color
    ) {
      await prisma.taskSection.update({
        where: { id: existing.id },
        data: {
          name: definition.name,
          color: existing.color || definition.color,
          canonicalStatus: definition.canonicalStatus,
          isDefault: true,
          isDone: definition.isDone,
          isBacklog: definition.isBacklog,
        },
      })
      changed = true
    }
  }

  const redundantDefaultIds = existingSections
    .filter((section) => section.isDefault && !claimedDefaultIds.has(section.id))
    .map((section) => section.id)
  if (redundantDefaultIds.length > 0) {
    await prisma.taskSection.updateMany({
      where: { id: { in: redundantDefaultIds }, projectId },
      data: { isDefault: false, isBacklog: false },
    })
    changed = true
  }

  const sections = changed
    ? await prisma.taskSection.findMany({ where: { projectId }, orderBy: { orderIndex: 'asc' } })
    : existingSections

  const defaultSectionByStatus = new Map<TaskStatus, StatusSectionFields>()
  for (const status of ['TODO', 'IN_PROGRESS', 'DONE'] as TaskStatus[]) {
    const preferred = selectPreferredStatusSection(sections, status)
    if (preferred) defaultSectionByStatus.set(status, preferred)
  }

  await Promise.all(
    (['TODO', 'IN_PROGRESS', 'DONE'] as TaskStatus[]).map((status) => {
      const section = defaultSectionByStatus.get(status)
      if (!section) return Promise.resolve()

      return prisma.task.updateMany({
        where: { projectId, sectionId: null, status },
        data: {
          sectionId: section.id,
          completedAt: status === 'DONE' ? new Date() : null,
        },
      })
    })
  )

  return sections
}

export async function getDefaultProjectStatusSection(projectId: string, status: TaskStatus) {
  const sections = await ensureProjectStatusSections(projectId)
  return (
    selectPreferredStatusSection(sections, status) ||
    sections[0] ||
    null
  )
}

export async function resolveTaskStatusSection(input: {
  projectId: string
  sectionId?: string | null
  status?: TaskStatus
  fallbackStatus?: TaskStatus
}) {
  if (input.sectionId) {
    return prisma.taskSection.findFirst({
      where: { id: input.sectionId, projectId: input.projectId },
    })
  }

  const status = input.status || input.fallbackStatus
  if (status) {
    return getDefaultProjectStatusSection(input.projectId, status)
  }

  return null
}

export { DEFAULT_STATUS_SECTIONS }
