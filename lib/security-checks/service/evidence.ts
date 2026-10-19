// §8 Evidence pipeline:
//   1. authoriseUpload — before the browser uploads: ownership, task state,
//      extension/MIME/size/count, prohibited-content acknowledgement.
//   2. completeUpload  — after the upload: size + magic-byte check; a failing
//      file is deleted immediately and never recorded. (Malware scanning
//      slots in here in v2 without changing the flow.)
//   3. openEvidence    — authorised view/download; every access is logged.
import { prisma } from '@/lib/db'
import { canDownloadEvidence, canViewEvidence, type SecurityActor } from '../access'
import {
  cleanDisplayName,
  evidencePathPrefix,
  validateEvidenceContent,
  validateEvidenceMeta,
  type EvidenceMime,
} from '../evidence'
import type { EvidenceTokenPayload } from '../schemas'
import { isSubtaskEditable } from '../submission'
import { canEmployeeEdit } from '../timeline'
import { LIMITS, type SubtaskStatus, type TaskStatus } from '../types'
import { actorEntry } from './actor'
import { appendAudit } from './audit'
import type { BlobStore, StoredBlob } from './blob-store'
import { type Db, inTransaction } from './db'
import { conflict, forbidden, notFound, SecurityChecksError } from './errors'
import { timelineOf, type TaskWithDetail } from './task-views'
import { loadOwnTask } from './tasks'

const TOKEN_VALIDITY_MS = 5 * 60 * 1000

function uploadTarget(task: TaskWithDetail, subtaskId: string, now: Date) {
  if (!task.cycle.campaign.evidenceRequired) throw conflict('This check does not take evidence files')
  if (!canEmployeeEdit(timelineOf(task), now)) throw conflict('This task can no longer be edited')
  const subtask = task.subtasks.find((entry) => entry.id === subtaskId)
  if (!subtask) throw notFound('Subtask not found')
  if (subtask.source === 'DECLARATION') throw conflict('The declaration does not take files')
  if (!isSubtaskEditable(task.status as TaskStatus, subtask.status as SubtaskStatus)) throw conflict(`“${subtask.name}” is not open for changes`)
  const uploadedThisRound = subtask.files.filter((file) => file.submissionId === null && file.deletedAt === null).length
  return { subtask, uploadedThisRound }
}

function assertPathInScope(pathname: string, taskId: string, subtaskId: string): void {
  if (!pathname.startsWith(evidencePathPrefix(taskId, subtaskId)) || pathname.includes('..')) {
    throw new SecurityChecksError('Invalid upload path', 400)
  }
}

export interface UploadPermit {
  allowedContentTypes: EvidenceMime[]
  maximumSizeInBytes: number
  validUntil: number
  addRandomSuffix: true
}

export async function authoriseUpload(
  actor: SecurityActor,
  payload: EvidenceTokenPayload,
  pathname: string,
  now: Date,
  db: Db = prisma,
): Promise<UploadPermit> {
  const task = await loadOwnTask(db, actor, payload.taskId)
  const { uploadedThisRound } = uploadTarget(task, payload.subtaskId, now)
  assertPathInScope(pathname, task.id, payload.subtaskId)
  const check = validateEvidenceMeta(payload, uploadedThisRound, task.cycle.campaign.fileLimit)
  if (!check.ok) throw new SecurityChecksError(check.error, 400)
  return {
    allowedContentTypes: [check.mime],
    maximumSizeInBytes: LIMITS.maxFileBytes,
    validUntil: now.getTime() + TOKEN_VALIDITY_MS,
    addRandomSuffix: true,
  }
}

export interface CompletedEvidence {
  id: string
  fileName: string
  contentType: string
  size: number
}

export async function completeUpload(
  actor: SecurityActor,
  taskId: string,
  input: { subtaskId: string; pathname: string; fileName: string },
  now: Date,
  store: BlobStore,
  db: Db = prisma,
): Promise<CompletedEvidence> {
  const fileName = cleanDisplayName(input.fileName)
  const reject = async (task: TaskWithDetail, reason: string): Promise<never> => {
    await store.remove(input.pathname)
    await appendAudit(db, actorEntry(actor, 'EVIDENCE_BLOCKED', 'SUBTASK', {
      targetId: input.subtaskId,
      taskId,
      campaignId: task.campaignId,
      cycleId: task.cycleId,
      details: { fileName, reason },
    }))
    throw new SecurityChecksError(reason, 400)
  }

  const task = await loadOwnTask(db, actor, taskId)
  assertPathInScope(input.pathname, taskId, input.subtaskId)
  // A path that is already recorded must never reach reject(), which deletes the blob.
  const recorded = await db.securityEvidenceFile.findFirst({ where: { storagePath: input.pathname }, select: { id: true } })
  if (recorded) throw conflict('This file was already attached')
  const { uploadedThisRound } = uploadTarget(task, input.subtaskId, now)
  const stored = await store.head(input.pathname)
  if (!stored) throw new SecurityChecksError('The upload could not be found. Try again.', 400)

  const meta = validateEvidenceMeta({ fileName, contentType: stored.contentType, size: stored.size }, uploadedThisRound, task.cycle.campaign.fileLimit)
  if (!meta.ok) return reject(task, meta.error)
  const prefix = await store.readPrefix(input.pathname, 16)
  const contentError = prefix ? validateEvidenceContent(meta.mime, prefix) : 'The upload could not be read. Try again.'
  if (contentError) return reject(task, contentError)

  return inTransaction(db, async (tx) => {
    const duplicate = await tx.securityEvidenceFile.findFirst({ where: { storagePath: input.pathname }, select: { id: true } })
    if (duplicate) throw conflict('This file was already attached')
    // Re-check inside the transaction: a submit that landed meanwhile locks the round.
    const fresh = await tx.securityTask.findUnique({ where: { id: taskId }, select: { status: true, deadline: true, resubmitDueAt: true, finalRoundAt: true, expiryReason: true, reopenedAt: true } })
    const freshSubtask = await tx.securitySubtask.findUnique({ where: { id: input.subtaskId }, select: { status: true } })
    if (
      !fresh ||
      !freshSubtask ||
      !canEmployeeEdit(timelineOf(fresh), now) ||
      !isSubtaskEditable(fresh.status as TaskStatus, freshSubtask.status as SubtaskStatus)
    ) {
      await store.remove(input.pathname)
      throw conflict('This item was submitted while the file was uploading. Reload and try again.')
    }
    // Re-count inside the transaction so parallel completions cannot exceed the limit.
    const roundCount = await tx.securityEvidenceFile.count({ where: { subtaskId: input.subtaskId, submissionId: null, deletedAt: null } })
    if (roundCount >= task.cycle.campaign.fileLimit) {
      await store.remove(input.pathname)
      throw new SecurityChecksError(`You can attach at most ${task.cycle.campaign.fileLimit} files here. Remove one to add another.`, 400)
    }
    const file = await tx.securityEvidenceFile.create({
      data: {
        subtaskId: input.subtaskId,
        taskId,
        storagePath: input.pathname,
        fileName,
        contentType: meta.mime,
        size: stored.size,
        uploadedById: actor.id,
      },
    })
    await appendAudit(tx, actorEntry(actor, 'EVIDENCE_UPLOADED', 'EVIDENCE', {
      targetId: file.id,
      taskId,
      campaignId: task.campaignId,
      cycleId: task.cycleId,
      details: { fileName, size: stored.size, contentType: meta.mime, subtaskId: input.subtaskId },
    }))
    return { id: file.id, fileName, contentType: meta.mime, size: stored.size }
  })
}

export interface OpenedEvidence extends StoredBlob {
  fileName: string
}

export async function openEvidence(
  actor: SecurityActor,
  fileId: string,
  mode: 'view' | 'download',
  store: BlobStore,
  db: Db = prisma,
): Promise<OpenedEvidence> {
  const file = await db.securityEvidenceFile.findUnique({
    where: { id: fileId },
    include: { subtask: { select: { task: { select: { userId: true, campaignId: true, cycleId: true } } } } },
  })
  if (!file) throw notFound('File not found')
  const owner = file.subtask.task
  const allowed = mode === 'view' ? canViewEvidence(actor, owner.userId) : canDownloadEvidence(actor, owner.userId)
  if (!allowed) {
    // Owners of other tasks learn nothing; console viewers learn downloads are not theirs.
    if (canViewEvidence(actor, owner.userId)) throw forbidden('Your role can view evidence but not download it')
    throw notFound('File not found')
  }
  if (file.deletedAt) throw new SecurityChecksError(`This file was deleted: ${file.deletedReason ?? 'no reason recorded'}`, 410)
  const blob = await store.open(file.storagePath)
  if (!blob) throw notFound('File not found in storage')
  await appendAudit(db, actorEntry(actor, mode === 'view' ? 'EVIDENCE_VIEWED' : 'EVIDENCE_DOWNLOADED', 'EVIDENCE', {
    targetId: file.id,
    taskId: file.taskId,
    campaignId: owner.campaignId,
    cycleId: owner.cycleId,
    details: { fileName: file.fileName },
  }))
  return { ...blob, fileName: file.fileName }
}

/** The employee removes a file they have not yet submitted. */
export async function removeDraftEvidence(actor: SecurityActor, fileId: string, now: Date, store: BlobStore, db: Db = prisma): Promise<void> {
  const path = await inTransaction(db, async (tx) => {
    const file = await tx.securityEvidenceFile.findUnique({ where: { id: fileId } })
    if (!file) throw notFound('File not found')
    const task = await loadOwnTask(tx, actor, file.taskId)
    if (file.deletedAt) throw conflict('This file was already removed')
    if (file.submissionId) throw conflict('Submitted files stay with the submission history')
    uploadTarget(task, file.subtaskId, now)
    await tx.securityEvidenceFile.update({
      where: { id: fileId },
      data: { deletedAt: now, deletedById: actor.id, deletedReason: 'Removed by the employee before submission' },
    })
    await appendAudit(tx, actorEntry(actor, 'EVIDENCE_REMOVED', 'EVIDENCE', {
      targetId: fileId,
      taskId: task.id,
      campaignId: task.campaignId,
      cycleId: task.cycleId,
      details: { fileName: file.fileName },
    }))
    return file.storagePath
  })
  await store.remove(path)
}
