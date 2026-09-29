import type { KpiEvidenceFile } from '@prisma/client'
import { prisma } from '@/lib/db'
import { availableActions } from '../actions'
import { checkEvidenceUpload, claimEvidenceError } from '../evidence'
import { canClaim, canViewKpi, type KpiActor } from '../permissions'
import type { ClaimInput, RespondInput } from '../schemas'
import { transition, type KpiAction } from '../state-machine'
import type { KpiStatusValue } from '../view-types'
import { loadKpiContext } from './context'
import { KpiError } from './errors'
import { eventRole, recordEvent } from './events'
import type { EvidenceStore, StoredEvidence } from './evidence-store'
import { assertFresh, findKpi, kpiRefOf, loadForAction, stateOf, STALE_MESSAGE, type LoadedKpi } from './kpi-load'

const CLAIM_DENIED = 'You cannot claim this KPI'
const MAX_FILES_PER_KPI = 10

export interface KpiActionResult { id: string; status: KpiStatusValue; version: number }

function nextStatus(kpi: LoadedKpi, action: KpiAction, now: Date): KpiStatusValue {
  const result = transition(stateOf(kpi), action, kpi.goal.kpiMonth, now)
  if (!result.ok) throw new KpiError(result.error, 409)
  return result.to
}

const clean = (value: string | undefined): string | null => value?.trim() || null

export async function claimKpi(actor: KpiActor, kpiId: string, input: ClaimInput, now: Date = new Date()): Promise<KpiActionResult> {
  const { before, kpi } = await loadForAction(kpiId, (k) => canClaim(actor, kpiRefOf(k)), CLAIM_DENIED, now)
  assertFresh(before, input.version)
  const revising = kpi.status === 'CLAIMED_DONE'
  if (revising && input.outcome === 'NOT_DONE') throw new KpiError('This KPI is already claimed done; revise its evidence instead', 409)
  const to = nextStatus(kpi, revising ? { type: 'REVISE_CLAIM' } : { type: input.outcome === 'DONE' ? 'CLAIM_DONE' : 'CLAIM_NOT_DONE' }, now)
  const evidence = { note: clean(input.note), url: clean(input.url), reportedValue: clean(input.reportedValue) }
  if (input.outcome === 'DONE') {
    const problem = claimEvidenceError(kpi.evidenceType, { url: evidence.url, reportedValue: evidence.reportedValue, fileCount: kpi.files.length })
    if (problem) throw new KpiError(problem)
  }
  return prisma.$transaction(async (tx) => {
    const updated = await tx.kpi.updateMany({
      where: { id: kpi.id, version: kpi.version },
      data: {
        status: to, claimedById: actor.id, claimedAt: now, claimNote: evidence.note, claimUrl: evidence.url,
        reportedValue: evidence.reportedValue, version: { increment: 1 },
      },
    })
    if (updated.count === 0) throw new KpiError(STALE_MESSAGE, 409)
    await recordEvent(tx, {
      kpiId: kpi.id, kpiMonthId: kpi.goal.kpiMonthId, actorId: actor.id, actorRole: eventRole(actor, 'CLAIMER'),
      action: revising ? 'CLAIM_REVISED' : 'CLAIM', fromStatus: kpi.status, toStatus: to,
      after: { outcome: input.outcome, ...evidence, fileIds: kpi.files.map((file) => file.id) },
    })
    return { id: kpi.id, status: to, version: kpi.version + 1 }
  })
}

export async function respondToKpi(actor: KpiActor, kpiId: string, input: RespondInput, now: Date = new Date()): Promise<KpiActionResult> {
  const { before, kpi } = await loadForAction(kpiId, (k) => canClaim(actor, kpiRefOf(k)), CLAIM_DENIED, now)
  assertFresh(before, input.version)
  const appeal = input.kind === 'APPEAL'
  const to = nextStatus(kpi, { type: appeal ? 'APPEAL' : 'RESPOND' }, now)
  const url = clean(input.url) ?? kpi.claimUrl
  const reportedValue = clean(input.reportedValue) ?? kpi.reportedValue
  const problem = claimEvidenceError(kpi.evidenceType, { url, reportedValue, fileCount: kpi.files.length })
  if (problem) throw new KpiError(problem)
  return prisma.$transaction(async (tx) => {
    const updated = await tx.kpi.updateMany({
      where: { id: kpi.id, version: kpi.version },
      data: {
        status: to, claimUrl: url, reportedValue, claimNote: input.note,
        // The reply supersedes the last decision; the event log keeps it.
        decidedById: null, decidedAt: null, decisionNote: null,
        ...(appeal ? { appealUsedAt: now } : {}),
        version: { increment: 1 },
      },
    })
    if (updated.count === 0) throw new KpiError(STALE_MESSAGE, 409)
    await recordEvent(tx, {
      kpiId: kpi.id, kpiMonthId: kpi.goal.kpiMonthId, actorId: actor.id, actorRole: eventRole(actor, 'CLAIMER'),
      action: appeal ? 'APPEAL' : 'RESPOND', fromStatus: kpi.status, toStatus: to, reason: input.note,
      after: { url, reportedValue, fileIds: kpi.files.map((file) => file.id) },
    })
    return { id: kpi.id, status: to, version: kpi.version + 1 }
  })
}

export async function uploadEvidence(
  actor: KpiActor,
  kpiId: string,
  file: { fileName: string; bytes: Uint8Array },
  store: EvidenceStore,
  now: Date = new Date(),
): Promise<{ file: KpiEvidenceFile; kpiVersion: number }> {
  const { kpi } = await loadForAction(kpiId, (k) => canClaim(actor, kpiRefOf(k)), CLAIM_DENIED, now)
  const actions = availableActions(actor, kpiRefOf(kpi), stateOf(kpi), kpi.goal.kpiMonth, now, kpi.changes.length > 0)
  if (!actions.uploadEvidence) throw new KpiError('Evidence can only be added while this KPI is open for a claim, reply or appeal', 409)
  if (kpi.files.length >= MAX_FILES_PER_KPI) throw new KpiError(`A KPI can hold at most ${MAX_FILES_PER_KPI} files`, 409)
  const check = checkEvidenceUpload(file.fileName, file.bytes)
  if (!check.ok) throw new KpiError(check.error)
  const pathname = await store.put(`kpi-evidence/${kpi.id}/${check.fileName}`, file.bytes, check.contentType)
  return prisma.$transaction(async (tx) => {
    const row = await tx.kpiEvidenceFile.create({
      data: { kpiId: kpi.id, blobPath: pathname, fileName: check.fileName, contentType: check.contentType, size: file.bytes.length, uploadedById: actor.id },
    })
    await recordEvent(tx, {
      kpiId: kpi.id, kpiMonthId: kpi.goal.kpiMonthId, actorId: actor.id, actorRole: eventRole(actor, 'CLAIMER'),
      action: 'EVIDENCE_ADD', after: { fileId: row.id, fileName: row.fileName, size: row.size },
    })
    return { file: row, kpiVersion: kpi.version }
  })
}

/** Streams an evidence file to someone who can see its KPI; everyone else gets 404, not 403. */
export async function readEvidence(actor: KpiActor, fileId: string, store: EvidenceStore): Promise<{ file: KpiEvidenceFile; stored: StoredEvidence }> {
  const file = await prisma.kpiEvidenceFile.findUnique({ where: { id: fileId } })
  if (!file) throw new KpiError('File not found', 404)
  const kpi = await findKpi(file.kpiId)
  const { scope } = await loadKpiContext()
  if (!canViewKpi(actor, kpiRefOf(kpi), scope)) throw new KpiError('File not found', 404)
  const stored = await store.get(file.blobPath)
  if (!stored) throw new KpiError('File not found', 404)
  return { file, stored }
}
