// The leads' sheet: "every time someone completes, Execution gets a notification to verify". A done claim emails the
// Execution team and anyone granted the verifier role straight away (HR stays the backup through the daily digest).
// Nobody is emailed about a KPI they may not decide, and each claim is announced once.
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { escapeHtml } from '@/lib/sanitize'
import { canVerify, type KpiActor } from '../permissions'
import { departmentKeyOf } from '../scope'
import { findKpi, kpiRefOf } from './kpi-load'
import type { SendMail, SendResult } from './notifications'

/** Real people are copied onto the preview, so the instant emails go out only where this is switched on. */
export const kpiEmailsOn = (): boolean => process.env.KPI_SEND_EMAILS === 'true'

async function executionTeam(): Promise<Array<KpiActor & { email: string; name: string }>> {
  const grants = await prisma.kpiRoleGrant.findMany({ where: { role: 'VERIFIER' }, select: { userId: true } })
  const people = await prisma.user.findMany({
    where: { OR: [{ role: 'EXECUTION' }, { id: { in: grants.map((grant) => grant.userId) } }] },
    select: { id: true, name: true, email: true, role: true, position: true, department: true, payrollProfile: { select: { isPayrollActive: true } } },
  })
  const granted = new Set(grants.map((grant) => grant.userId))
  return people
    .filter((person) => person.email && person.payrollProfile?.isPayrollActive !== false)
    .map((person) => ({
      id: person.id, name: person.name, email: person.email as string, role: person.role, position: person.position,
      departmentKey: departmentKeyOf(person.department), grants: granted.has(person.id) ? ['VERIFIER' as const] : [],
    }))
}

function renderClaimAlert(name: string, kpi: { title: string; target: string }, claimer: string, appUrl: string) {
  const link = `${appUrl.replace(/\/$/, '')}/kpis/verify`
  return {
    subject: `KPI ready to verify: ${kpi.title}`,
    html:
      `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111">` +
      `<p>Hi ${escapeHtml(name)},</p>` +
      `<p>${escapeHtml(claimer)} marked <strong>${escapeHtml(kpi.title)}</strong> complete (target: ${escapeHtml(kpi.target)}).</p>` +
      `<p><a href="${escapeHtml(link)}">Open verification</a></p></div>`,
  }
}

const isUniqueViolation = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'

export async function alertVerifiersOfClaim(kpiId: string, send: SendMail, appUrl: string): Promise<SendResult> {
  const result: SendResult = { sent: 0, skipped: 0, failed: 0 }
  if (!kpiEmailsOn()) return result
  const kpi = await findKpi(kpiId)
  if (kpi.status !== 'CLAIMED_DONE' || !kpi.claimedAt) return result
  const ref = kpiRefOf(kpi)
  const claimer = kpi.claimedById ? (await prisma.user.findUnique({ where: { id: kpi.claimedById }, select: { name: true } }))?.name ?? 'Someone' : 'Someone'
  for (const verifier of await executionTeam()) {
    if (!canVerify(verifier, ref)) {
      result.skipped += 1
      continue
    }
    const dedupeKey = `claim:${kpi.id}:${kpi.claimedAt.toISOString()}:${verifier.id}`
    try {
      await prisma.kpiNotification.create({ data: { userId: verifier.id, kind: 'claim-alert', dedupeKey } })
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
      result.skipped += 1
      continue
    }
    try {
      const { subject, html } = renderClaimAlert(verifier.name, kpi, claimer, appUrl)
      await send(verifier.email, subject, html)
      result.sent += 1
    } catch (error) {
      console.error('[kpi] claim alert failed', { kpiId, userId: verifier.id, error })
      await prisma.kpiNotification.delete({ where: { dedupeKey } })
      result.failed += 1
    }
  }
  return result
}
