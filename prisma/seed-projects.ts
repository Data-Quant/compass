import { PrismaClient, type ProjectStatus, type TaskPriority, type TaskStatus } from '@prisma/client'
import { DEFAULT_STATUS_SECTIONS } from '../lib/project-status-sections'

/**
 * Demo data for the project management module: projects, sections, labels,
 * tasks with subtasks, assistants and comments, with deadlines relative to
 * today so the board always has overdue, upcoming and undated work.
 *
 * Needs the users from `npm run db:seed`. Re-running replaces only the projects
 * named below. Refuses any database that is not on this machine.
 */

const prisma = new PrismaClient()

const DAY = 24 * 60 * 60 * 1000
const daysFromNow = (days: number) => new Date(Date.now() + days * DAY)

function assertLocalDatabase(url: string | undefined) {
  const host = url ? new URL(url).hostname : ''
  if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
    throw new Error(`Refusing to seed demo projects into a non-local database (host "${host || 'unset'}")`)
  }
}

type SectionKey = 'Backlog' | 'To Do' | 'In Progress' | 'Done' | 'Under Testing'

interface TaskSeed {
  title: string
  description?: string
  section: SectionKey
  priority?: TaskPriority
  assignee?: string
  assistants?: string[]
  start?: number
  due?: number
  completedDaysAgo?: number
  labels?: string[]
  comments?: Array<{ author: string; content: string }>
  subtasks?: TaskSeed[]
}

interface ProjectSeed {
  name: string
  description: string
  color: string
  status: ProjectStatus
  owner: string
  members: string[]
  leads?: string[]
  extraSections?: Array<{ name: string; color: string; canonicalStatus: TaskStatus }>
  labels: Array<{ name: string; color: string }>
  tasks: TaskSeed[]
}

const PROJECTS: ProjectSeed[] = [
  {
    name: 'Demo: Client portal relaunch',
    description: 'Rebuild the client portal on the new design system.',
    color: '#6366f1',
    status: 'ACTIVE',
    owner: 'hr@example.com',
    members: ['manager1@example.com', 'employee1@example.com', 'employee2@example.com', 'employee3@example.com'],
    leads: ['manager1@example.com'],
    extraSections: [{ name: 'Under Testing', color: '#f59e0b', canonicalStatus: 'IN_PROGRESS' }],
    labels: [
      { name: 'bug', color: '#ef4444' },
      { name: 'feature', color: '#22c55e' },
      { name: 'design', color: '#a855f7' },
    ],
    tasks: [
      {
        title: 'Login page redesign',
        description: 'New layout, SSO button and error states.',
        section: 'In Progress',
        priority: 'HIGH',
        assignee: 'employee1@example.com',
        assistants: ['employee2@example.com'],
        start: -6,
        due: 2,
        labels: ['feature', 'design'],
        comments: [
          { author: 'manager1@example.com', content: 'Please keep the old URL working for bookmarks.' },
          { author: 'employee1@example.com', content: 'Done, it redirects now.' },
        ],
        subtasks: [
          { title: 'Wireframes', section: 'Done', assignee: 'employee2@example.com', due: -3, completedDaysAgo: 4 },
          { title: 'Build the form', section: 'Done', assignee: 'employee1@example.com', due: -1, completedDaysAgo: 1 },
          { title: 'Error states', section: 'In Progress', assignee: 'employee1@example.com', due: 2 },
        ],
      },
      {
        // Every subtask is done but the parent is still open: what auto-complete should fix.
        title: 'Migrate client documents',
        section: 'Under Testing',
        priority: 'MEDIUM',
        assignee: 'employee3@example.com',
        due: 5,
        labels: ['feature'],
        subtasks: [
          { title: 'Export from the old store', section: 'Done', assignee: 'employee3@example.com', due: -2, completedDaysAgo: 3 },
          { title: 'Import and verify checksums', section: 'Done', assignee: 'employee3@example.com', due: 1, completedDaysAgo: 1 },
        ],
      },
      {
        title: 'Session expires during upload',
        description: 'Uploads over 5 minutes lose the session and fail.',
        section: 'To Do',
        priority: 'HIGH',
        assignee: 'employee2@example.com',
        due: -2,
        labels: ['bug'],
      },
      { title: 'Dashboard empty states', section: 'To Do', priority: 'LOW', assignee: 'employee3@example.com', due: 9, labels: ['design'] },
      { title: 'Accessibility audit', section: 'To Do', priority: 'MEDIUM', assignee: 'manager1@example.com', due: 1 },
      { title: 'Write release notes', section: 'To Do', priority: 'LOW', assignee: 'employee1@example.com' },
      { title: 'Set up error tracking', section: 'Done', priority: 'MEDIUM', assignee: 'employee2@example.com', due: -10, completedDaysAgo: 8, labels: ['feature'] },
      { title: 'Fix broken footer links', section: 'Done', priority: 'LOW', assignee: 'employee1@example.com', due: -7, completedDaysAgo: 5, labels: ['bug'] },
      { title: 'Dark mode', description: 'Not planned yet.', section: 'Backlog', priority: 'LOW' },
      { title: 'Two-factor login', section: 'Backlog', priority: 'MEDIUM', labels: ['feature'] },
    ],
  },
  {
    name: 'Demo: Q4 hiring',
    description: 'Hire two engineers and a designer before the end of the year.',
    color: '#0ea5e9',
    status: 'ACTIVE',
    owner: 'manager2@example.com',
    members: ['employee4@example.com', 'employee5@example.com', 'hr@example.com'],
    labels: [{ name: 'urgent', color: '#f97316' }],
    tasks: [
      { title: 'Publish job posts', section: 'Done', priority: 'HIGH', assignee: 'employee4@example.com', due: -14, completedDaysAgo: 13 },
      {
        title: 'Screen applicants',
        section: 'In Progress',
        priority: 'HIGH',
        assignee: 'employee5@example.com',
        assistants: ['employee4@example.com'],
        due: 4,
        labels: ['urgent'],
        subtasks: [
          { title: 'Engineering shortlist', section: 'In Progress', assignee: 'employee5@example.com', due: 3 },
          { title: 'Design shortlist', section: 'To Do', assignee: 'employee4@example.com', due: 6 },
        ],
      },
      { title: 'Book interview panels', section: 'To Do', priority: 'MEDIUM', assignee: 'manager2@example.com', due: 7 },
      { title: 'Offer letter template', section: 'To Do', priority: 'MEDIUM', assignee: 'hr@example.com', due: 12 },
      { title: 'Referral bonus policy', section: 'Backlog', priority: 'LOW' },
    ],
  },
  {
    name: 'Demo: Office move',
    description: 'Finished last quarter.',
    color: '#10b981',
    status: 'COMPLETED',
    owner: 'hr@example.com',
    members: ['employee1@example.com'],
    labels: [],
    tasks: [
      // Finished after its due date, so it shows as completed late.
      { title: 'Pick the new office', section: 'Done', assignee: 'hr@example.com', due: -60, completedDaysAgo: 55 },
      { title: 'Move the equipment', section: 'Done', assignee: 'employee1@example.com', due: -40, completedDaysAgo: 41 },
    ],
  },
  {
    name: 'Demo: Intranet wiki',
    description: 'Paused until the portal relaunch ships.',
    color: '#94a3b8',
    status: 'ON_HOLD',
    owner: 'manager1@example.com',
    members: ['employee2@example.com'],
    labels: [],
    tasks: [
      { title: 'Choose a wiki tool', section: 'In Progress', assignee: 'manager1@example.com', due: -20 },
      { title: 'Move the handbook pages', section: 'To Do', assignee: 'employee2@example.com' },
    ],
  },
]

async function main() {
  assertLocalDatabase(process.env.DATABASE_URL)

  const emails = new Set(PROJECTS.flatMap((project) => [
    project.owner,
    ...project.members,
    ...project.tasks.flatMap(function taskEmails(task): string[] {
      return [
        ...(task.assignee ? [task.assignee] : []),
        ...(task.assistants || []),
        ...(task.comments || []).map((comment) => comment.author),
        ...(task.subtasks || []).flatMap(taskEmails),
      ]
    }),
  ]))
  const users = await prisma.user.findMany({ where: { email: { in: [...emails] } }, select: { id: true, email: true } })
  const userId = new Map(users.map((user) => [user.email, user.id]))
  const missing = [...emails].filter((email) => !userId.has(email))
  if (missing.length > 0) {
    throw new Error(`Missing users ${missing.join(', ')}. Run \`npm run db:seed\` first.`)
  }
  const id = (email: string) => userId.get(email)!

  const removed = await prisma.project.deleteMany({ where: { name: { in: PROJECTS.map((project) => project.name) } } })
  if (removed.count > 0) console.log(`Replaced ${removed.count} existing demo projects`)

  let taskCount = 0
  for (const seed of PROJECTS) {
    const project = await prisma.project.create({
      data: {
        name: seed.name,
        description: seed.description,
        color: seed.color,
        status: seed.status,
        ownerId: id(seed.owner),
        // Same membership and starter sections as POST /api/projects.
        members: {
          create: [
            { userId: id(seed.owner), role: 'OWNER' },
            ...seed.members
              .filter((email) => email !== seed.owner)
              .map((email) => ({ userId: id(email), role: seed.leads?.includes(email) ? 'LEAD' : 'MEMBER' })),
          ],
        },
        sections: {
          create: [
            ...DEFAULT_STATUS_SECTIONS.map((section) => ({
              name: section.name,
              color: section.color,
              canonicalStatus: section.canonicalStatus,
              isDefault: true,
              isDone: section.isDone,
              isBacklog: section.isBacklog,
              orderIndex: section.orderIndex,
            })),
            ...(seed.extraSections || []).map((section, index) => ({
              ...section,
              orderIndex: DEFAULT_STATUS_SECTIONS.length + index,
            })),
          ],
        },
        labels: { create: seed.labels },
      },
      include: { sections: true, labels: true },
    })
    const sectionByName = new Map(project.sections.map((section) => [section.name, section]))
    const labelByName = new Map(project.labels.map((label) => [label.name, label.id]))

    const createTask = async (task: TaskSeed, orderIndex: number, parentTaskId: string | null) => {
      const section = sectionByName.get(task.section)
      if (!section) throw new Error(`${seed.name} has no "${task.section}" section`)
      const status: TaskStatus = section.isDone ? 'DONE' : section.canonicalStatus
      const dueDate = task.due === undefined ? null : daysFromNow(task.due)
      const completedAt = status === 'DONE' ? daysFromNow(-(task.completedDaysAgo ?? 0)) : null

      const created = await prisma.task.create({
        data: {
          projectId: project.id,
          sectionId: section.id,
          parentTaskId,
          title: task.title,
          description: task.description,
          status,
          priority: task.priority || 'MEDIUM',
          assigneeId: task.assignee ? id(task.assignee) : null,
          startDate: task.start === undefined ? null : daysFromNow(task.start),
          dueDate,
          completedAt,
          completedLate: Boolean(completedAt && dueDate && completedAt > dueDate),
          orderIndex,
          assistants: {
            create: (task.assistants || []).map((email) => ({ userId: id(email), assignedById: id(seed.owner) })),
          },
          labelAssignments: {
            create: (task.labels || []).map((name) => {
              const labelId = labelByName.get(name)
              if (!labelId) throw new Error(`${seed.name} has no "${name}" label`)
              return { labelId }
            }),
          },
          comments: {
            create: (task.comments || []).map((comment) => ({ authorId: id(comment.author), content: comment.content })),
          },
        },
      })
      taskCount += 1
      for (const [index, subtask] of (task.subtasks || []).entries()) {
        await createTask(subtask, index, created.id)
      }
    }

    for (const [index, task] of seed.tasks.entries()) {
      await createTask(task, index, null)
    }
    console.log(`Created ${seed.name} (${seed.status})`)
  }

  console.log(`Seeded ${PROJECTS.length} projects with ${taskCount} tasks`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
