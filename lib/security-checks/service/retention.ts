// §9 Retention (values pending leadership approval — configurable settings).
// Evidence is deleted N months after a cycle's *actual* close, always;
// attestation records and audit rows are pruned on their own schedules.
// Ships disabled; on first enablement it works through the backlog (in
// batches across runs). Each run logs a summary entry under the system identity.
import type { SecuritySettings } from '@prisma/client'
import { prisma } from '@/lib/db'
import { canManageCampaigns, type SecurityActor } from '../access'
import { addMonths } from '../dates'
import { actorEntry, requireCapability } from './actor'
import { appendAudit, systemEntry } from './audit'
import type { BlobStore } from './blob-store'
import { type Db, inTransaction } from './db'
import { SecurityChecksError } from './errors'

const SETTINGS_ID = 'singleton'
const EVIDENCE_BATCH = 500
const CYCLE_BATCH = 20

export async function getSettings(db: Db = prisma): Promise<SecuritySettings> {
  return db.securitySettings.upsert({ where: { id: SETTINGS_ID }, update: {}, create: { id: SETTINGS_ID } })
}

export interface SettingsPatch {
  retentionEnabled?: boolean
  evidenceRetentionMonths?: number
  attestationRetentionMonths?: number
  auditRetentionMonths?: number
}

export const MIN_AUDIT_RETENTION_MONTHS = 12

type RetentionValues = Pick<SecuritySettings, 'evidenceRetentionMonths' | 'attestationRetentionMonths' | 'auditRetentionMonths'>

/** The audit trail must outlive the records it describes and can never be shortened below a floor. */
export function retentionSettingsError(values: RetentionValues): string | null {
  if (values.auditRetentionMonths < MIN_AUDIT_RETENTION_MONTHS) return `Audit-log retention must be at least ${MIN_AUDIT_RETENTION_MONTHS} months`
  if (values.auditRetentionMonths < Math.max(values.evidenceRetentionMonths, values.attestationRetentionMonths)) {
    return 'Audit-log retention cannot be shorter than evidence or attestation retention'
  }
  if (values.attestationRetentionMonths < values.evidenceRetentionMonths) return 'Attestation records cannot be kept for less time than evidence'
  return null
}

export async function updateSettings(actor: SecurityActor, patch: SettingsPatch, db: Db = prisma): Promise<SecuritySettings> {
  requireCapability(canManageCampaigns(actor), 'Only Security Admins change retention settings')
  return inTransaction(db, async (tx) => {
    const before = await getSettings(tx)
    const invalid = retentionSettingsError({ ...before, ...patch })
    if (invalid) throw new SecurityChecksError(invalid, 400)
    const after = await tx.securitySettings.update({ where: { id: SETTINGS_ID }, data: { ...patch, updatedById: actor.id } })
    await appendAudit(tx, actorEntry(actor, 'SETTINGS_UPDATED', 'SETTINGS', {
      targetId: SETTINGS_ID,
      details: {
        before: { enabled: before.retentionEnabled, evidence: before.evidenceRetentionMonths, attestation: before.attestationRetentionMonths, audit: before.auditRetentionMonths },
        after: { enabled: after.retentionEnabled, evidence: after.evidenceRetentionMonths, attestation: after.attestationRetentionMonths, audit: after.auditRetentionMonths },
      },
    }))
    return after
  })
}

async function pruneEvidence(cutoff: Date, months: number, now: Date, store: BlobStore, db: Db): Promise<{ deleted: number; failed: number }> {
  const files = await db.securityEvidenceFile.findMany({
    where: { deletedAt: null, subtask: { task: { cycle: { actualCloseAt: { lt: cutoff } } } } },
    select: { id: true, storagePath: true },
    take: EVIDENCE_BATCH,
  })
  let deleted = 0
  let failed = 0
  for (const file of files) {
    try {
      await store.remove(file.storagePath)
      await db.securityEvidenceFile.update({
        where: { id: file.id },
        data: { deletedAt: now, deletedReason: `Retention: evidence is kept ${months} months after the cycle closes` },
      })
      deleted += 1
    } catch (error) {
      failed += 1
      console.error('[security-checks] retention could not delete evidence', { fileId: file.id, error })
    }
  }
  return { deleted, failed }
}

async function pruneAttestations(cutoff: Date, db: Db): Promise<{ cycles: number; tasks: number }> {
  const cycles = await db.securityCycle.findMany({ where: { actualCloseAt: { lt: cutoff } }, select: { id: true }, take: CYCLE_BATCH })
  let tasks = 0
  for (const cycle of cycles) {
    tasks += await inTransaction(db, async (tx) => {
      const ids = (await tx.securityTask.findMany({ where: { cycleId: cycle.id }, select: { id: true } })).map((task) => task.id)
      const liveFiles = await tx.securityEvidenceFile.count({ where: { taskId: { in: ids }, deletedAt: null } })
      if (liveFiles > 0) return 0 // evidence still present: wait until the evidence pass removes it
      await tx.securityEvidenceFile.deleteMany({ where: { taskId: { in: ids } } })
      await tx.securityReviewAction.deleteMany({ where: { taskId: { in: ids } } })
      await tx.securitySubmission.deleteMany({ where: { taskId: { in: ids } } })
      await tx.securitySubtask.deleteMany({ where: { taskId: { in: ids } } })
      await tx.securityNotification.deleteMany({ where: { taskId: { in: ids } } })
      await tx.securityTask.deleteMany({ where: { id: { in: ids } } })
      await tx.securityCycle.delete({ where: { id: cycle.id } })
      return ids.length
    })
  }
  return { cycles: cycles.length, tasks }
}

export async function runRetention(now: Date, store: BlobStore, db: Db = prisma): Promise<Record<string, unknown>> {
  const settings = await getSettings(db)
  if (!settings.retentionEnabled) return { skipped: true, reason: 'Retention is disabled until values are approved' }
  const firstRun = settings.retentionFirstRunAt === null
  const evidenceCutoff = addMonths(now, -settings.evidenceRetentionMonths)
  const attestationCutoff = addMonths(now, -settings.attestationRetentionMonths)
  const auditCutoff = addMonths(now, -settings.auditRetentionMonths)

  const evidence = await pruneEvidence(evidenceCutoff, settings.evidenceRetentionMonths, now, store, db)
  const attestations = await pruneAttestations(attestationCutoff, db)
  const audit = await db.securityAuditLog.deleteMany({ where: { createdAt: { lt: auditCutoff } } })
  if (firstRun) await db.securitySettings.update({ where: { id: SETTINGS_ID }, data: { retentionFirstRunAt: now } })

  const summary = {
    firstRun,
    evidenceDeleted: evidence.deleted,
    evidenceFailed: evidence.failed,
    cyclesPruned: attestations.cycles,
    tasksPruned: attestations.tasks,
    auditRowsPruned: audit.count,
    cutoffs: { evidence: evidenceCutoff, attestation: attestationCutoff, audit: auditCutoff },
  }
  await appendAudit(db, systemEntry('RETENTION_RUN', 'JOB', { targetId: 'retention', details: summary }))
  return summary
}
