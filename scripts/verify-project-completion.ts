/**
 * End-to-end check of auto-completion against the real DB using a disposable
 * project that is deleted at the end. Does not touch real projects.
 */
import { prisma } from '../lib/db'
import { syncProjectCompletion } from '../lib/project-completion'

async function main() {
  const owner = await prisma.user.findFirst({ select: { id: true } })
  if (!owner) throw new Error('No users in DB to own the test project')

  const project = await prisma.project.create({
    data: {
      name: `__completion_test__ ${Date.now()}`,
      ownerId: owner.id,
      members: { create: [{ userId: owner.id, role: 'OWNER' }] },
    },
    select: { id: true, status: true },
  })

  try {
    const t1 = await prisma.task.create({ data: { projectId: project.id, title: 'T1', status: 'TODO' }, select: { id: true } })
    const t2 = await prisma.task.create({ data: { projectId: project.id, title: 'T2', status: 'DONE' }, select: { id: true } })

    const afterPartial = await syncProjectCompletion(project.id)
    const partialStatus = (await prisma.project.findUnique({ where: { id: project.id }, select: { status: true } }))!.status
    console.log(`1 of 2 done -> sync returned ${afterPartial ?? 'no change'} | status=${partialStatus} (expect ACTIVE)`)

    await prisma.task.update({ where: { id: t1.id }, data: { status: 'DONE' } })
    const afterAllDone = await syncProjectCompletion(project.id)
    const doneStatus = (await prisma.project.findUnique({ where: { id: project.id }, select: { status: true } }))!.status
    console.log(`2 of 2 done -> sync returned ${afterAllDone ?? 'no change'} | status=${doneStatus} (expect COMPLETED)`)

    await prisma.task.update({ where: { id: t2.id }, data: { status: 'IN_PROGRESS' } })
    const afterReopen = await syncProjectCompletion(project.id)
    const reopenStatus = (await prisma.project.findUnique({ where: { id: project.id }, select: { status: true } }))!.status
    console.log(`reopened a task -> sync returned ${afterReopen ?? 'no change'} | status=${reopenStatus} (expect ACTIVE)`)

    const pass = partialStatus === 'ACTIVE' && doneStatus === 'COMPLETED' && reopenStatus === 'ACTIVE'
    console.log(`\n${pass ? 'PASS' : 'FAIL'}: auto-completion behaves as expected`)
  } finally {
    await prisma.task.deleteMany({ where: { projectId: project.id } })
    await prisma.projectMember.deleteMany({ where: { projectId: project.id } })
    await prisma.project.delete({ where: { id: project.id } })
    console.log('cleaned up test project')
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
