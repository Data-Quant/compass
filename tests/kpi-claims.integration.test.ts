import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { claimKpi, readEvidence, respondToKpi, uploadEvidence } from '../lib/kpi/service/claims'
import { KpiError } from '../lib/kpi/service/errors'
import { memoryEvidenceStore } from '../lib/kpi/service/evidence-store'
import { createGoal, createKpi } from '../lib/kpi/service/goals'
import type { EvidenceTypeValue } from '../lib/kpi/view-types'
import { decideKpi } from '../lib/kpi/service/verification'
import { actorFor, DB_TEST, KPI_DB_READY, PEOPLE, resetKpiTestData, seedKpiPeople } from './helpers/kpi-test-db'

const beforeLock = new Date('2026-10-02T08:00:00Z')
const afterLock = new Date('2026-10-20T08:00:00Z')
const afterClaims = new Date('2026-11-06T08:00:00Z')
const lead = actorFor(PEOPLE.lead)
const isStatus = (status: number) => (e: unknown) => e instanceof KpiError && e.status === status
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])

beforeEach(async () => {
  if (!KPI_DB_READY) return
  await resetKpiTestData(prisma)
  await seedKpiPeople(prisma)
})
after(async () => {
  await prisma.$disconnect()
})

async function teamGoal() {
  return createGoal(lead, { monthKey: '2026-10', scope: 'TEAM', title: 'Grow pipeline' }, beforeLock)
}

async function teamKpi(evidenceType: EvidenceTypeValue = 'LINK', goalId?: string, title = 'Outreach') {
  const id = goalId ?? (await teamGoal()).id
  return createKpi(lead, { goalId: id, title, target: '40 emails', evidenceType, ownerIds: [PEOPLE.member.id] }, beforeLock)
}

test('the lead claims a team KPI done with a link once it has locked', DB_TEST, async () => {
  const kpi = await teamKpi()
  const result = await claimKpi(lead, kpi.id, { version: 0, outcome: 'DONE', url: 'https://drive.example/report', note: 'Sent 41' }, afterLock)
  assert.equal(result.status, 'CLAIMED_DONE')
  const stored = await prisma.kpi.findUniqueOrThrow({ where: { id: kpi.id } })
  assert.equal(stored.claimedById, PEOPLE.lead.id)
  assert.equal(stored.claimUrl, 'https://drive.example/report')
  const events = await prisma.kpiEvent.findMany({ where: { kpiId: kpi.id } })
  assert.deepEqual(events.map((e) => `${e.action}:${e.actorRole}`).sort(), ['CLAIM:CLAIMER', 'GOALS_LOCK:SYSTEM', 'KPI_CREATE:SETTER'])
})

test('owners, stale screens, late claims and missing proof are refused', DB_TEST, async () => {
  const kpi = await teamKpi()
  await assert.rejects(claimKpi(actorFor(PEOPLE.member), kpi.id, { version: 0, outcome: 'DONE', url: 'https://x.example' }, afterLock), isStatus(403))
  assert.equal((await prisma.kpi.findUniqueOrThrow({ where: { id: kpi.id } })).status, 'DRAFT')
  await assert.rejects(claimKpi(lead, kpi.id, { version: 0, outcome: 'DONE' }, afterLock), /link/)
  await assert.rejects(claimKpi(lead, kpi.id, { version: 7, outcome: 'DONE', url: 'https://x.example' }, afterLock), isStatus(409))
  await assert.rejects(claimKpi(lead, kpi.id, { version: 1, outcome: 'DONE', url: 'https://x.example' }, afterClaims), isStatus(409))
})

test('not done is final; a done claim can be revised but not turned into not done', DB_TEST, async () => {
  const goal = await teamGoal()
  const first = await teamKpi('LINK', goal.id)
  const second = await teamKpi('LINK', goal.id, 'Demos')
  assert.equal((await claimKpi(lead, first.id, { version: 0, outcome: 'NOT_DONE', note: 'Client paused' }, afterLock)).status, 'NOT_DONE')
  const done = await claimKpi(lead, second.id, { version: 0, outcome: 'DONE', url: 'https://x.example/a' }, afterLock)
  const revised = await claimKpi(lead, second.id, { version: done.version, outcome: 'DONE', url: 'https://x.example/b' }, afterLock)
  assert.equal(revised.status, 'CLAIMED_DONE')
  await assert.rejects(claimKpi(lead, second.id, { version: revised.version, outcome: 'NOT_DONE' }, afterLock), isStatus(409))
})

test('document KPIs need an uploaded file, readable only by people who can see the KPI', DB_TEST, async () => {
  const store = memoryEvidenceStore()
  const kpi = await teamKpi('DOCUMENT')
  await assert.rejects(claimKpi(lead, kpi.id, { version: 0, outcome: 'DONE' }, afterLock), /Upload/)
  await assert.rejects(uploadEvidence(actorFor(PEOPLE.member), kpi.id, { fileName: 'proof.pdf', bytes: PDF }, store, afterLock), isStatus(403))
  await assert.rejects(uploadEvidence(lead, kpi.id, { fileName: 'tool.exe', bytes: new Uint8Array([0x4d, 0x5a, 0, 0]) }, store, afterLock), isStatus(400))
  const { file, kpiVersion } = await uploadEvidence(lead, kpi.id, { fileName: 'Proof.pdf', bytes: PDF }, store, afterLock)
  assert.equal(file.fileName, 'proof.pdf')
  assert.equal(kpiVersion, 1)
  assert.equal((await claimKpi(lead, kpi.id, { version: kpiVersion, outcome: 'DONE' }, afterLock)).status, 'CLAIMED_DONE')
  const read = await readEvidence(actorFor(PEOPLE.member), file.id, store)
  assert.equal(read.file.contentType, 'application/pdf')
  await assert.rejects(readEvidence(actorFor(PEOPLE.orphan), file.id, store), isStatus(404))
})

test('department KPIs are claimed by an owning lead or JP, not the Partner who set them', DB_TEST, async () => {
  const partner = actorFor(PEOPLE.partner)
  const goal = await createGoal(partner, { monthKey: '2026-10', scope: 'DEPARTMENT', departmentKey: 'product', title: 'Ship roadmap' }, beforeLock)
  const kpi = await createKpi(partner, { goalId: goal.id, title: 'Release v2', target: 'Live', evidenceType: 'NUMBER', ownerIds: [PEOPLE.lead.id, PEOPLE.jp.id] }, beforeLock)
  await assert.rejects(claimKpi(partner, kpi.id, { version: 0, outcome: 'DONE', reportedValue: '1' }, afterLock), isStatus(403))
  assert.equal((await claimKpi(actorFor(PEOPLE.jp), kpi.id, { version: 0, outcome: 'DONE', reportedValue: '1 release' }, afterLock)).status, 'CLAIMED_DONE')
})

test('a needs-info claim can be answered, and a rejection appealed once', DB_TEST, async () => {
  const kpi = await teamKpi()
  const claimed = await claimKpi(lead, kpi.id, { version: 0, outcome: 'DONE', url: 'https://x.example/a' }, afterLock)
  await prisma.kpi.update({ where: { id: kpi.id }, data: { status: 'NEEDS_INFO', decidedById: PEOPLE.verifier.id, decisionNote: 'Which report?', version: { increment: 1 } } })
  const replied = await respondToKpi(lead, kpi.id, { version: claimed.version + 1, kind: 'REPLY', note: 'The October summary', url: 'https://x.example/b' }, afterClaims)
  assert.equal(replied.status, 'CLAIMED_DONE')
  const afterReply = await prisma.kpi.findUniqueOrThrow({ where: { id: kpi.id } })
  assert.equal(afterReply.claimUrl, 'https://x.example/b')
  assert.equal(afterReply.decisionNote, null)
  await prisma.kpi.update({ where: { id: kpi.id }, data: { status: 'REJECTED', decidedById: PEOPLE.verifier.id, version: { increment: 1 } } })
  const appealed = await respondToKpi(lead, kpi.id, { version: replied.version + 1, kind: 'APPEAL', note: 'It went live on the 31st' }, afterClaims)
  assert.equal(appealed.status, 'APPEALED')
  await prisma.kpi.update({ where: { id: kpi.id }, data: { status: 'REJECTED', version: { increment: 1 } } })
  await assert.rejects(respondToKpi(lead, kpi.id, { version: appealed.version + 1, kind: 'APPEAL', note: 'Again please' }, afterClaims), /already been appealed/)
})

test('a reply after the response deadline is refused and the claim ends not verified', DB_TEST, async () => {
  const kpi = await teamKpi()
  const claimed = await claimKpi(lead, kpi.id, { version: 0, outcome: 'DONE', url: 'https://x.example/a' }, afterLock)
  await prisma.kpi.update({ where: { id: kpi.id }, data: { status: 'NEEDS_INFO', decidedById: PEOPLE.verifier.id, version: { increment: 1 } } })
  const late = new Date('2026-11-16T08:00:00Z')
  await assert.rejects(respondToKpi(lead, kpi.id, { version: claimed.version + 1, kind: 'REPLY', note: 'Sorry, this is late' }, late), isStatus(409))
  assert.equal((await prisma.kpi.findUniqueOrThrow({ where: { id: kpi.id } })).status, 'NOT_VERIFIED')
})

test('a claim link that is not http or https is refused, even when claiming not done', DB_TEST, async () => {
  const kpi = await teamKpi()
  await assert.rejects(claimKpi(lead, kpi.id, { version: 0, outcome: 'NOT_DONE', url: 'javascript:alert(1)' }, afterLock), /http/)
  assert.equal((await prisma.kpi.findUniqueOrThrow({ where: { id: kpi.id } })).claimUrl, null)
})

test('late claims and late replies say which deadline passed', DB_TEST, async () => {
  const verifier = actorFor(PEOPLE.verifier, ['VERIFIER'])
  const goal = await teamGoal()
  const unclaimed = await teamKpi('LINK', goal.id)
  const asked = await teamKpi('LINK', goal.id, 'Demos')
  await assert.rejects(claimKpi(lead, unclaimed.id, { version: 0, outcome: 'DONE', url: 'https://x.example' }, afterClaims), /claims deadline has passed/)
  const claimed = await claimKpi(lead, asked.id, { version: 0, outcome: 'DONE', url: 'https://x.example/a' }, afterLock)
  const decided = await decideKpi(verifier, asked.id, { version: claimed.version, decision: 'NEEDS_INFO', note: 'Which report?' }, afterLock)
  const late = new Date('2026-11-16T08:00:00Z')
  await assert.rejects(respondToKpi(lead, asked.id, { version: decided.version, kind: 'REPLY', note: 'Sorry, this is late' }, late), /response deadline has passed/)
})

test('a second appeal after the final decision is refused as already used', DB_TEST, async () => {
  const verifier = actorFor(PEOPLE.verifier, ['VERIFIER'])
  const kpi = await teamKpi()
  const claimed = await claimKpi(lead, kpi.id, { version: 0, outcome: 'DONE', url: 'https://x.example/a' }, afterLock)
  const rejected = await decideKpi(verifier, kpi.id, { version: claimed.version, decision: 'REJECTED', note: 'No proof' }, afterLock)
  const appealed = await respondToKpi(lead, kpi.id, { version: rejected.version, kind: 'APPEAL', note: 'Here is the proof' }, afterLock)
  const final = await decideKpi(verifier, kpi.id, { version: appealed.version, decision: 'NOT_VERIFIED', note: 'Still no proof' }, afterLock)
  await assert.rejects(respondToKpi(lead, kpi.id, { version: final.version, kind: 'APPEAL', note: 'One more time' }, afterLock), /already been appealed/)
})
