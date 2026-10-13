// §3 Campaign setup: create, edit (structure locked after launch), activate,
// clone-as-new-version, retire. Only Security Admins manage campaigns.
import { randomUUID } from 'node:crypto'
import type { Prisma, SecurityCampaign, SecurityCampaignQuestion, SecurityCampaignSubtask } from '@prisma/client'
import { put } from '@vercel/blob'
import { cleanDisplayName, safeStorageName, sniffEvidenceMime } from '../evidence'
import { blobToken } from './blob-store'
import { prisma } from '@/lib/db'
import { canManageCampaigns, canViewConsole, type SecurityActor } from '../access'
import { parseAudience } from '../audience'
import { karachiDateKey, startOfKarachiDateKey } from '../dates'
import {
  activationIssues,
  CAMPAIGN_IMAGE_PREFIX,
  definitionIssues,
  LIVE_EDITABLE_FIELDS,
  usesAdminSubtasks,
  type CampaignDefinition,
  type CampaignFields,
  type CampaignUpdate,
} from '../schemas'
import { actorEntry, actorRoleLabel, requireCapability } from './actor'
import { appendAudit } from './audit'
import { type Db, inTransaction, toJson } from './db'
import { conflict, notFound, SecurityChecksError } from './errors'
import { openNextCycleIfDue } from './cycles'

export type FullCampaign = SecurityCampaign & {
  questions: SecurityCampaignQuestion[]
  subtaskTemplates: SecurityCampaignSubtask[]
}

const FULL_INCLUDE = {
  questions: { orderBy: { position: 'asc' } },
  subtaskTemplates: { orderBy: { position: 'asc' } },
} satisfies Prisma.SecurityCampaignInclude

export function fieldsOf(campaign: FullCampaign): CampaignFields {
  return {
    name: campaign.name,
    control: campaign.control,
    instructions: campaign.instructions,
    instructionImages: Array.isArray(campaign.instructionImages) ? (campaign.instructionImages as CampaignFields['instructionImages']) : [],
    videoUrl: campaign.videoUrl,
    questions: campaign.questions.map((question) => ({
      type: question.type,
      prompt: question.prompt,
      compliantAnswer: question.compliantAnswer,
    })),
    subtaskMode: campaign.subtaskMode,
    subtasks: campaign.subtaskTemplates.map((template) => template.name),
    evidenceRequired: campaign.evidenceRequired,
    fileLimit: campaign.fileLimit,
    deadlineDays: campaign.deadlineDays,
    reminderOffsets: campaign.reminderOffsets,
    frequency: campaign.frequency,
    recurrenceAnchor: campaign.recurrenceAnchor,
    audience: parseAudience(campaign.audience),
    firstOpenDate: campaign.firstOpenAt ? karachiDateKey(campaign.firstOpenAt) : null,
  }
}

function definitionOf(fields: CampaignFields): CampaignDefinition {
  return { ...fields, subtasks: usesAdminSubtasks(fields.subtaskMode) ? fields.subtasks : [] }
}

function assertNoIssues(issues: string[]): void {
  if (issues.length > 0) throw new SecurityChecksError(issues.join('; '), 400)
}

function scalarData(fields: CampaignFields) {
  return {
    name: fields.name,
    control: fields.control,
    instructions: fields.instructions,
    instructionImages: toJson(fields.instructionImages),
    videoUrl: fields.videoUrl,
    subtaskMode: fields.subtaskMode,
    evidenceRequired: fields.evidenceRequired,
    fileLimit: fields.fileLimit,
    deadlineDays: fields.deadlineDays,
    reminderOffsets: [...fields.reminderOffsets].sort((a, b) => b - a),
    frequency: fields.frequency,
    recurrenceAnchor: fields.recurrenceAnchor,
    audience: toJson(fields.audience),
    firstOpenAt: fields.firstOpenDate ? startOfKarachiDateKey(fields.firstOpenDate) : null,
  }
}

function structureData(fields: CampaignFields) {
  return {
    questions: {
      create: fields.questions.map((question, position) => ({
        position,
        type: question.type,
        prompt: question.prompt,
        compliantAnswer: question.type === 'YES_NO' ? (question.compliantAnswer ?? null) : null,
      })),
    },
    subtaskTemplates: {
      create: (usesAdminSubtasks(fields.subtaskMode) ? fields.subtasks : []).map((name, position) => ({ position, name })),
    },
  }
}

async function loadFull(db: Db, id: string): Promise<FullCampaign> {
  const campaign = await db.securityCampaign.findUnique({ where: { id }, include: FULL_INCLUDE })
  if (!campaign) throw notFound('Campaign not found')
  return campaign
}

export async function createCampaign(actor: SecurityActor, input: CampaignFields, db: Db = prisma): Promise<FullCampaign> {
  requireCapability(canManageCampaigns(actor), 'Only Security Admins can create campaigns')
  assertNoIssues(definitionIssues(definitionOf(input)))
  return inTransaction(db, async (tx) => {
    const id = randomUUID()
    const campaign = await tx.securityCampaign.create({
      data: { id, lineageId: id, createdById: actor.id, updatedById: actor.id, ...scalarData(input), ...structureData(input) },
      include: FULL_INCLUDE,
    })
    await appendAudit(tx, actorEntry(actor, 'CAMPAIGN_CREATED', 'CAMPAIGN', { targetId: id, campaignId: id, details: { name: input.name } }))
    return campaign
  })
}

export async function updateCampaign(actor: SecurityActor, id: string, patch: CampaignUpdate, db: Db = prisma): Promise<FullCampaign> {
  requireCapability(canManageCampaigns(actor), 'Only Security Admins can edit campaigns')
  return inTransaction(db, async (tx) => {
    const existing = await loadFull(tx, id)
    if (existing.status === 'CLOSED') throw conflict('Retired campaigns cannot be edited')
    const changed = Object.keys(patch) as Array<keyof CampaignUpdate>
    if (existing.status === 'ACTIVE') {
      const locked = changed.filter((key) => !(LIVE_EDITABLE_FIELDS as readonly string[]).includes(key))
      if (locked.length > 0) {
        throw conflict(`These fields are locked after launch: ${locked.join(', ')}. Clone the campaign to change its structure.`)
      }
    }
    const merged: CampaignFields = { ...fieldsOf(existing), ...patch } as CampaignFields
    assertNoIssues(definitionIssues(definitionOf(merged)))
    const structural = existing.status === 'DRAFT' && (changed.includes('questions') || changed.includes('subtasks') || changed.includes('subtaskMode'))
    if (structural) {
      await tx.securityCampaignQuestion.deleteMany({ where: { campaignId: id } })
      await tx.securityCampaignSubtask.deleteMany({ where: { campaignId: id } })
    }
    const data = existing.status === 'ACTIVE' ? liveData(merged) : scalarData(merged)
    const campaign = await tx.securityCampaign.update({
      where: { id },
      data: { ...data, updatedById: actor.id, ...(structural ? structureData(merged) : {}) },
      include: FULL_INCLUDE,
    })
    await appendAudit(tx, actorEntry(actor, 'CAMPAIGN_UPDATED', 'CAMPAIGN', { targetId: id, campaignId: id, details: { fields: changed, live: existing.status === 'ACTIVE' } }))
    return campaign
  })
}

function liveData(fields: CampaignFields) {
  return {
    instructions: fields.instructions,
    instructionImages: toJson(fields.instructionImages),
    videoUrl: fields.videoUrl,
    reminderOffsets: [...fields.reminderOffsets].sort((a, b) => b - a),
    audience: toJson(fields.audience),
  }
}

/** Activates a draft; a clone's activation retires its predecessor (whose open cycle still finishes). */
export async function activateCampaign(actor: SecurityActor, id: string, now: Date, db: Db = prisma): Promise<FullCampaign> {
  requireCapability(canManageCampaigns(actor), 'Only Security Admins can activate campaigns')
  await inTransaction(db, async (tx) => {
    const existing = await loadFull(tx, id)
    if (existing.status !== 'DRAFT') throw conflict('Only draft campaigns can be activated')
    assertNoIssues(activationIssues(definitionOf(fieldsOf(existing)), karachiDateKey(now)))
    await tx.securityCampaign.update({ where: { id }, data: { status: 'ACTIVE', launchedAt: now, updatedById: actor.id } })
    await appendAudit(tx, actorEntry(actor, 'CAMPAIGN_ACTIVATED', 'CAMPAIGN', { targetId: id, campaignId: id, details: { version: existing.version } }))
    if (existing.predecessorId) {
      const retired = await tx.securityCampaign.updateMany({
        where: { id: existing.predecessorId, status: 'ACTIVE' },
        data: { status: 'CLOSED', retiredAt: now, updatedById: actor.id },
      })
      if (retired.count > 0) {
        await appendAudit(tx, actorEntry(actor, 'CAMPAIGN_RETIRED', 'CAMPAIGN', {
          targetId: existing.predecessorId,
          campaignId: existing.predecessorId,
          details: { reason: `Superseded by version ${existing.version}`, successorId: id },
        }))
      }
    }
  })
  await openNextCycleIfDue(id, now, db, { actorId: actor.id, actorRole: actorRoleLabel(actor) })
  return loadFull(db, id)
}

/** Structural changes after launch: copy the definition into a new Draft version (no cycles). */
export async function cloneCampaign(actor: SecurityActor, id: string, db: Db = prisma): Promise<FullCampaign> {
  requireCapability(canManageCampaigns(actor), 'Only Security Admins can clone campaigns')
  return inTransaction(db, async (tx) => {
    const source = await loadFull(tx, id)
    const pending = await tx.securityCampaign.findFirst({ where: { predecessorId: id, status: 'DRAFT' }, select: { id: true } })
    if (pending) throw conflict('A draft new version of this campaign already exists')
    const fields: CampaignFields = { ...fieldsOf(source), firstOpenDate: null }
    const cloneId = randomUUID()
    const clone = await tx.securityCampaign.create({
      data: {
        id: cloneId,
        lineageId: source.lineageId,
        predecessorId: source.id,
        version: source.version + 1,
        createdById: actor.id,
        updatedById: actor.id,
        ...scalarData(fields),
        ...structureData(fields),
      },
      include: FULL_INCLUDE,
    })
    await appendAudit(tx, actorEntry(actor, 'CAMPAIGN_CLONED', 'CAMPAIGN', { targetId: cloneId, campaignId: cloneId, details: { sourceId: id, version: clone.version } }))
    return clone
  })
}

export async function retireCampaign(actor: SecurityActor, id: string, reason: string, now: Date, db: Db = prisma): Promise<void> {
  requireCapability(canManageCampaigns(actor), 'Only Security Admins can retire campaigns')
  await inTransaction(db, async (tx) => {
    const result = await tx.securityCampaign.updateMany({ where: { id, status: 'ACTIVE' }, data: { status: 'CLOSED', retiredAt: now, updatedById: actor.id } })
    if (result.count === 0) throw conflict('Only active campaigns can be retired')
    await appendAudit(tx, actorEntry(actor, 'CAMPAIGN_RETIRED', 'CAMPAIGN', { targetId: id, campaignId: id, details: { reason } }))
  })
}

export async function deleteDraftCampaign(actor: SecurityActor, id: string, db: Db = prisma): Promise<void> {
  requireCapability(canManageCampaigns(actor), 'Only Security Admins can delete drafts')
  await inTransaction(db, async (tx) => {
    const campaign = await tx.securityCampaign.findUnique({ where: { id }, select: { status: true, name: true, _count: { select: { cycles: true } } } })
    if (!campaign) throw notFound('Campaign not found')
    if (campaign.status !== 'DRAFT' || campaign._count.cycles > 0) throw conflict('Only never-launched drafts can be deleted')
    await tx.securityCampaign.delete({ where: { id } })
    await appendAudit(tx, actorEntry(actor, 'CAMPAIGN_DRAFT_DELETED', 'CAMPAIGN', { targetId: id, campaignId: id, details: { name: campaign.name } }))
  })
}

export async function getCampaign(actor: SecurityActor, id: string, db: Db = prisma): Promise<FullCampaign> {
  requireCapability(canViewConsole(actor))
  return loadFull(db, id)
}

export interface CampaignDetail {
  id: string
  status: string
  version: number
  lineageId: string
  predecessorId: string | null
  launchedAt: string | null
  retiredAt: string | null
  fields: CampaignFields
  cycles: Array<{ id: string; number: number; openAt: string; deadline: string; scheduledCloseAt: string; actualCloseAt: string | null; status: string; taskCount: number }>
}

export async function campaignDetail(actor: SecurityActor, id: string, db: Db = prisma): Promise<CampaignDetail> {
  const campaign = await getCampaign(actor, id, db)
  const cycles = await db.securityCycle.findMany({ where: { campaignId: id }, orderBy: { number: 'desc' }, include: { _count: { select: { tasks: true } } } })
  return {
    id: campaign.id,
    status: campaign.status,
    version: campaign.version,
    lineageId: campaign.lineageId,
    predecessorId: campaign.predecessorId,
    launchedAt: campaign.launchedAt?.toISOString() ?? null,
    retiredAt: campaign.retiredAt?.toISOString() ?? null,
    fields: fieldsOf(campaign),
    cycles: cycles.map((cycle) => ({
      id: cycle.id,
      number: cycle.number,
      openAt: cycle.openAt.toISOString(),
      deadline: cycle.deadline.toISOString(),
      scheduledCloseAt: cycle.scheduledCloseAt.toISOString(),
      actualCloseAt: cycle.actualCloseAt?.toISOString() ?? null,
      status: cycle.status,
      taskCount: cycle._count.tasks,
    })),
  }
}

const MAX_IMAGE_BYTES = 4 * 1024 * 1024

/** Instruction example image (PNG/JPG ≤ 4 MB), stored privately and served to signed-in users. */
export async function uploadCampaignImage(actor: SecurityActor, campaignId: string, file: File, db: Db = prisma): Promise<{ path: string; name: string }> {
  requireCapability(canManageCampaigns(actor), 'Only Security Admins can add instruction images')
  const campaign = await db.securityCampaign.findUnique({ where: { id: campaignId }, select: { status: true } })
  if (!campaign) throw notFound('Campaign not found')
  if (campaign.status === 'CLOSED') throw conflict('Retired campaigns cannot be edited')
  if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) throw new SecurityChecksError('Images must be PNG or JPG and at most 4 MB', 400)
  const bytes = new Uint8Array(await file.arrayBuffer())
  const mime = sniffEvidenceMime(bytes)
  if (mime !== 'image/png' && mime !== 'image/jpeg') throw new SecurityChecksError('Images must be PNG or JPG and at most 4 MB', 400)
  const name = cleanDisplayName(file.name)
  const blob = await put(`${CAMPAIGN_IMAGE_PREFIX}${campaignId}/${safeStorageName(name)}.${mime === 'image/png' ? 'png' : 'jpg'}`, Buffer.from(bytes), {
    access: 'private',
    addRandomSuffix: true,
    contentType: mime,
    token: blobToken(),
  })
  await appendAudit(db, actorEntry(actor, 'CAMPAIGN_IMAGE_UPLOADED', 'CAMPAIGN', { targetId: campaignId, campaignId, details: { name, size: file.size } }))
  return { path: blob.pathname, name }
}

export async function listCampaignRecords(actor: SecurityActor, db: Db = prisma) {
  requireCapability(canViewConsole(actor))
  return db.securityCampaign.findMany({
    orderBy: [{ status: 'asc' }, { updatedAt: 'desc' }],
    include: { cycles: { orderBy: { number: 'desc' }, take: 1 }, _count: { select: { cycles: true } } },
  })
}
