import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { getProjectAuthorization, isProjectRecordId, projectAuthorizationFailure } from '@/lib/project-access'
import { assertSameOrigin, SameOriginError } from '@/lib/security/same-origin'
import { validateSprintCompletionPlan } from '@/lib/project-sprints'

class SprintCompletionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

// POST - Complete a sprint by hand. This is the only code path that completes
// sprints or moves tasks between them in bulk; nothing runs automatically.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sprintId: string }> }
) {
  try {
    assertSameOrigin(request.headers, request.url)
    const user = await getSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id: projectId, sprintId } = await params
    const authorization = await getProjectAuthorization(projectId, user)
    const authorizationFailure = projectAuthorizationFailure(authorization, 'manage')
    if (authorizationFailure) {
      return NextResponse.json({ error: authorizationFailure.error }, { status: authorizationFailure.status })
    }
    if (!isProjectRecordId(sprintId)) return NextResponse.json({ error: 'Sprint not found' }, { status: 404 })

    const body = await request.json().catch(() => null)
    const actorName = user.name || 'Someone'

    const result = await prisma.$transaction(async (tx) => {
      const projectSprints = await tx.sprint.findMany({
        where: { projectId },
        select: { id: true, name: true, completedAt: true },
      })
      const sprint = projectSprints.find((candidate) => candidate.id === sprintId)
      if (!sprint) throw new SprintCompletionError('Sprint not found', 404)
      if (sprint.completedAt) throw new SprintCompletionError('Sprint is already completed', 409)

      // Backlog tasks are excluded from sprint review, like everywhere else.
      const unfinished = await tx.task.findMany({
        where: {
          projectId,
          sprintId,
          status: { not: 'DONE' },
          OR: [{ sectionId: null }, { section: { isBacklog: false } }],
        },
        select: { id: true },
      })
      const plan = validateSprintCompletionPlan({
        sprintId,
        actions: body?.actions,
        unfinishedTaskIds: unfinished.map((task) => task.id),
        projectSprints,
      })
      if (!plan.ok) throw new SprintCompletionError(plan.error, 400)

      const sprintNames = new Map(projectSprints.map((candidate) => [candidate.id, candidate.name]))
      const moves = new Map<string | null, string[]>()
      for (const action of plan.value) {
        if (action.action === 'keep') continue
        const target = action.action === 'move' ? action.targetSprintId! : null
        moves.set(target, [...(moves.get(target) || []), action.taskId])
      }
      for (const [target, taskIds] of moves) {
        await tx.task.updateMany({ where: { id: { in: taskIds }, projectId, sprintId }, data: { sprintId: target } })
      }

      // Guard against a concurrent completion of the same sprint.
      const completed = await tx.sprint.updateMany({
        where: { id: sprintId, completedAt: null },
        data: { completedAt: new Date() },
      })
      if (completed.count !== 1) throw new SprintCompletionError('Sprint is already completed', 409)

      const activities = [...moves].flatMap(([target, taskIds]) => taskIds.map((taskId) => ({
        taskId,
        actorId: user.id,
        kind: 'sprint',
        summary: target
          ? `${actorName} moved the task to ${sprintNames.get(target)}`
          : `${actorName} removed the task from ${sprint.name}`,
        metadata: { taskId, fromSprintId: sprintId, toSprintId: target },
      })))
      if (activities.length > 0) await tx.taskActivity.createMany({ data: activities })

      return {
        moved: plan.value.filter((action) => action.action === 'move').length,
        cleared: plan.value.filter((action) => action.action === 'none').length,
        kept: plan.value.filter((action) => action.action === 'keep').length,
      }
    })

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    if (error instanceof SameOriginError) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (error instanceof SprintCompletionError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('Failed to complete sprint:', error)
    return NextResponse.json({ error: 'Failed to complete sprint' }, { status: 500 })
  }
}
