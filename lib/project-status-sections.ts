import type { TaskSection, TaskStatus } from '@prisma/client'
import { prisma } from '@/lib/db'

type StatusSectionFields = Pick<TaskSection, 'id' | 'name' | 'color' | 'canonicalStatus' | 'isDefault' | 'isDone' | 'orderIndex'>

const DEFAULT_STATUS_SECTIONS: Array<{
  name: string
  color: string
  canonicalStatus: TaskStatus
  isDone: boolean
  orderIndex: number
  aliases: string[]
}> = [
  {
    name: 'To Do',
    color: '#94a3b8',
    canonicalStatus: 'TODO',
    isDone: false,
    orderIndex: 0,
    aliases: ['todo', 'backlog'],
  },
  {
    name: 'In Progress',
    color: '#60a5fa',
    canonicalStatus: 'IN_PROGRESS',
    isDone: false,
    orderIndex: 1,
    aliases: ['inprogress', 'doing'],
  },
  {
    name: 'Done',
    color: '#22c55e',
    canonicalStatus: 'DONE',
    isDone: true,
    orderIndex: 2,
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
  return DEFAULT_STATUS_SECTIONS.find((definition) => (
    definition.aliases.includes(normalized) ||
    normalizeStatusName(definition.name) === normalized ||
    definition.canonicalStatus === nameOrStatus
  ))
}

export function getStatusSectionDefaults(name: string, orderIndex = 0) {
  const defaultDefinition = getDefaultStatusDefinition(name)
  if (defaultDefinition) {
    return {
      color: defaultDefinition.color,
      canonicalStatus: defaultDefinition.canonicalStatus,
      isDefault: true,
      isDone: defaultDefinition.isDone,
    }
  }

  return {
    color: CUSTOM_STATUS_COLORS[orderIndex % CUSTOM_STATUS_COLORS.length],
    canonicalStatus: 'IN_PROGRESS' as TaskStatus,
    isDefault: false,
    isDone: false,
  }
}

export function isDoneTaskSection(section: Pick<TaskSection, 'canonicalStatus' | 'isDone'> | null | undefined) {
  return Boolean(section?.isDone || section?.canonicalStatus === 'DONE')
}

export function getTaskStatusForSection(section: Pick<TaskSection, 'canonicalStatus' | 'isDone'>) {
  return isDoneTaskSection(section) ? 'DONE' : section.canonicalStatus
}

export async function ensureProjectStatusSections(projectId: string): Promise<StatusSectionFields[]> {
  const existingSections = await prisma.taskSection.findMany({
    where: { projectId },
    orderBy: { orderIndex: 'asc' },
  })

  const existingByNormalized = new Map(existingSections.map((section) => [normalizeStatusName(section.name), section]))
  let changed = false

  for (const definition of DEFAULT_STATUS_SECTIONS) {
    const existing = definition.aliases
      .map((alias) => existingByNormalized.get(alias))
      .find(Boolean)

    if (!existing) {
      await prisma.taskSection.create({
        data: {
          projectId,
          name: definition.name,
          color: definition.color,
          canonicalStatus: definition.canonicalStatus,
          isDefault: true,
          isDone: definition.isDone,
          orderIndex: definition.orderIndex,
        },
      })
      changed = true
      continue
    }

    if (
      existing.canonicalStatus !== definition.canonicalStatus ||
      existing.isDefault !== true ||
      existing.isDone !== definition.isDone ||
      !existing.color
    ) {
      await prisma.taskSection.update({
        where: { id: existing.id },
        data: {
          color: existing.color || definition.color,
          canonicalStatus: definition.canonicalStatus,
          isDefault: true,
          isDone: definition.isDone,
        },
      })
      changed = true
    }
  }

  const sections = changed
    ? await prisma.taskSection.findMany({ where: { projectId }, orderBy: { orderIndex: 'asc' } })
    : existingSections

  const defaultSectionByStatus = new Map<TaskStatus, StatusSectionFields>()
  for (const section of sections) {
    if (section.isDefault && !defaultSectionByStatus.has(section.canonicalStatus)) {
      defaultSectionByStatus.set(section.canonicalStatus, section)
    }
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
    sections.find((section) => section.isDefault && section.canonicalStatus === status) ||
    sections.find((section) => section.canonicalStatus === status) ||
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
