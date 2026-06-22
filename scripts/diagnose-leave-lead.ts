/** READ-ONLY: diagnose why a lead wasn't notified of a team member's leave. */
import { prisma } from '../lib/db'

async function findUser(nameFragment: string) {
  return prisma.user.findFirst({
    where: { name: { contains: nameFragment, mode: 'insensitive' } },
    select: { id: true, name: true, email: true, role: true, department: true, position: true },
  })
}

async function main() {
  const raveeha = await findUser('Raveeha')
  const areebah = await findUser('Areebah')
  console.log('Raveeha:', JSON.stringify(raveeha))
  console.log('Areebah:', JSON.stringify(areebah))
  if (!raveeha) return

  // Who are Raveeha's leads per the evaluatorMapping (what the notification uses)?
  const leadMappings = await prisma.evaluatorMapping.findMany({
    where: { evaluateeId: raveeha.id },
    include: { evaluator: { select: { id: true, name: true, email: true } } },
  })
  console.log('\nRaveeha evaluator mappings (all relationship types):')
  for (const m of leadMappings) {
    console.log(` ${m.relationshipType} <- ${m.evaluator.name} (email=${m.evaluator.email ?? 'NULL'})`)
  }
  const teamLeads = leadMappings.filter((m) => m.relationshipType === 'TEAM_LEAD')
  console.log(`\nTEAM_LEAD mappings for Raveeha: ${teamLeads.length}`)
  if (areebah) {
    const areebahIsTeamLead = teamLeads.some((m) => m.evaluator.id === areebah.id)
    console.log(`Is Areebah a TEAM_LEAD of Raveeha? ${areebahIsTeamLead}`)
    console.log(`Areebah email present? ${areebah.email ? 'yes' : 'NO (would be filtered out of notification)'}`)
    // Any mapping at all between them?
    const anyMapping = leadMappings.filter((m) => m.evaluator.id === areebah.id)
    console.log(`Any Areebah->Raveeha mappings: ${anyMapping.map((m) => m.relationshipType).join(', ') || 'NONE'}`)
  }

  // Recent leave requests by Raveeha and their status / notification audit
  const requests = await prisma.leaveRequest.findMany({
    where: { employeeId: raveeha.id },
    orderBy: { createdAt: 'desc' },
    take: 3,
    select: { id: true, status: true, leaveType: true, startDate: true, createdAt: true },
  })
  console.log('\nRecent Raveeha leave requests:')
  for (const r of requests) {
    console.log(` ${r.id} | ${r.leaveType} | ${r.status} | start=${r.startDate.toISOString().slice(0, 10)}`)
    const audit = await prisma.leaveAuditEvent.findMany({
      where: { leaveRequestId: r.id, eventType: 'REQUEST_NOTIFICATION' },
      select: { status: true, recipients: true },
    }).catch(() => [])
    for (const a of audit) {
      console.log(`   notification: ${a.status} | recipients: ${JSON.stringify(a.recipients)}`)
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
