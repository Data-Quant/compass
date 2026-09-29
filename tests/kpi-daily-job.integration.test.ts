import test, { after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { prisma } from '../lib/db'
import { claimKpi } from '../lib/kpi/service/claims'
import { runDailyKpiJob } from '../lib/kpi/service/daily-job'
import { createGoal, createKpi } from '../lib/kpi/service/goals'
import { decideKpi } from '../lib/kpi/service/verification'
import { actorFor, DB_TEST, KPI_DB_READY, PEOPLE, resetKpiTestData, seedKpiPeople } from './helpers/kpi-test-db'

const beforeLock = new Date('2026-10-02T08:00:00Z')
const afterLock = new Date('2026-10-20T08:00:00Z')
const dayBeforeClaimsClose = new Date('2026-11-03T04:00:00Z')
const laterThatDay = new Date('2026-11-03T10:00:00Z')
const afterClaims = new Date('2026-11-06T04:00:00Z')
const APP_URL = 'https://compass.example'
const lead = actorFor(PEOPLE.lead)

interface SentMail { to: string; subject: string; html: string }
function mailbox() {
  const sent: SentMail[] = []
  const send = async (to: string, subject: string, html: string) => {
    sent.push({ to, subject, html })
  }
  return { sent, send }
}

beforeEach(async () => {
  if (!KPI_DB_READY) return
  await resetKpiTestData(prisma)
  await seedKpiPeople(prisma)
})
after(async () => {
  await prisma.$disconnect()
})

async function teamKpi(title = 'Outreach') {
  const goal = await createGoal(lead, { monthKey: '2026-10', scope: 'TEAM', title: 'Grow pipeline' }, beforeLock)
  return createKpi(lead, { goalId: goal.id, title, target: '40 emails', evidenceType: 'LINK', ownerIds: [PEOPLE.member.id] }, beforeLock)
}

test('the day before claims close, the lead gets one digest naming the KPI, escaped', DB_TEST, async () => {
  await teamKpi('Outreach <b>Q4</b>')
  const mail = mailbox()
  const result = await runDailyKpiJob(mail.send, APP_URL, dayBeforeClaimsClose)
  assert.deepEqual(mail.sent.map((m) => m.to), ['kpit-lead@example.test'])
  assert.match(mail.sent[0].html, /Outreach &lt;b&gt;Q4&lt;\/b&gt;/)
  assert.match(mail.sent[0].html, /https:\/\/compass\.example\/kpis/)
  assert.deepEqual(result, { transitions: 1, finalized: 0, sent: 1, skipped: 0, failed: 0 })
})

test('a second run the same Karachi day sends nothing', DB_TEST, async () => {
  await teamKpi()
  const mail = mailbox()
  await runDailyKpiJob(mail.send, APP_URL, dayBeforeClaimsClose)
  const again = await runDailyKpiJob(mail.send, APP_URL, laterThatDay)
  assert.equal(mail.sent.length, 1)
  assert.equal(again.skipped, 1)
})

test('a failed send is retried on the next run', DB_TEST, async () => {
  await teamKpi()
  const failing = async () => {
    throw new Error('SMTP unavailable')
  }
  assert.equal((await runDailyKpiJob(failing, APP_URL, dayBeforeClaimsClose)).failed, 1)
  assert.equal(await prisma.kpiNotification.count(), 0)
  const mail = mailbox()
  assert.equal((await runDailyKpiJob(mail.send, APP_URL, laterThatDay)).sent, 1)
})

test('the job saves missed claims as not done and finalizes the finished month', DB_TEST, async () => {
  const kpi = await teamKpi()
  const result = await runDailyKpiJob(mailbox().send, APP_URL, afterClaims)
  assert.equal((await prisma.kpi.findUniqueOrThrow({ where: { id: kpi.id } })).status, 'NOT_DONE')
  assert.equal(result.finalized, 1)
  assert.ok((await prisma.kpiMonth.findFirstOrThrow()).finalizedAt)
})

test('verifiers hear about the queue, and the claimer hears about a needs-info reply', DB_TEST, async () => {
  const kpi = await teamKpi()
  const claim = await claimKpi(lead, kpi.id, { version: 0, outcome: 'DONE', url: 'https://x.example/proof' }, afterLock)
  const queueMail = mailbox()
  await runDailyKpiJob(queueMail.send, APP_URL, new Date('2026-10-21T04:00:00Z'))
  assert.deepEqual(queueMail.sent.map((m) => m.to).sort(), ['kpit-exec@example.test', 'kpit-hr@example.test'])
  await decideKpi(actorFor(PEOPLE.exec), kpi.id, { version: claim.version, decision: 'NEEDS_INFO', note: 'Which report?' }, new Date('2026-10-22T08:00:00Z'))
  const replyMail = mailbox()
  await runDailyKpiJob(replyMail.send, APP_URL, new Date('2026-10-23T04:00:00Z'))
  assert.deepEqual(replyMail.sent.map((m) => m.to), ['kpit-lead@example.test'])
})
