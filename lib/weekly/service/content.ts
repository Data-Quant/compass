import type { WeeklyCompetency, WeeklyCompetencyPrompt, WeeklyProfile } from '@prisma/client'
import { prisma } from '@/lib/db'
import { hasEffectiveLeadQuestionSet } from '@/lib/pre-evaluation'
import { findDraft, INSUFFICIENT_DEFINITION, type CompetencyContent } from '../content/drafts'
import { draftFromDescriptions } from '../content/templates'
import { perspectiveForBank, type Perspective } from '../perspectives'
import { parseProfileLevels, type LevelKey } from '../profile'
import type { ProfileDraftInput } from '../schemas'
import type { ContentCompetency, ContentResponse, ProfileView } from '../view-types'
import { recordAudit } from './audit'
import { assertHr, loadPeople, type WeeklyActor } from './context'
import { isUniqueViolation, toJson, type Db } from './db'
import { WeeklyError } from './errors'

const WEEKLY_BANKS = ['DIRECT_REPORT', 'TEAM_LEAD', 'PEER'] as const
type Descriptions = Record<LevelKey, string | null>
const NO_DESCRIPTIONS: Descriptions = { '1': null, '2': null, '3': null, '4': null }

export interface ReadyCompetency {
  id: string
  key: string
  name: string
  perspective: Perspective
  leadId: string | null
  prompts: Array<{ id: string; variant: string; text: string }>
}
export interface ReadyCompetencies { global: Map<Perspective, ReadyCompetency[]>; customByLead: Map<string, ReadyCompetency[]> }

export function descriptionsOf(q: { rating1Description: string | null; rating2Description: string | null; rating3Description: string | null; rating4Description: string | null }): Descriptions {
  return { '1': q.rating1Description, '2': q.rating2Description, '3': q.rating3Description, '4': q.rating4Description }
}

function createData(key: string, perspective: Perspective, content: CompetencyContent, extra: Partial<Pick<WeeklyCompetency, 'sourceQuestionId' | 'sourceLeadQuestionId' | 'leadId' | 'cycleId'>>, actorId: string | null) {
  return {
    key, perspective, name: content.name, definition: content.definition, ...extra,
    prompts: { create: [{ variant: 'A', text: content.prompts.A }, { variant: 'B', text: content.prompts.B }] },
    profiles: {
      create: { version: 1, levels: toJson(content.levels), insufficientDefinition: INSUFFICIENT_DEFINITION, incomplete: content.incomplete, createdById: actorId },
    },
  }
}

export async function syncFromQuestionBank(actor: WeeklyActor, db: Db = prisma): Promise<{ created: number; relinked: number; deactivated: number }> {
  assertHr(actor)
  const questions = await db.evaluationQuestion.findMany({
    where: { relationshipType: { in: [...WEEKLY_BANKS] }, questionType: 'RATING' },
    orderBy: [{ relationshipType: 'asc' }, { orderIndex: 'asc' }],
  })
  let created = 0
  let relinked = 0
  let replaced = 0
  for (const question of questions) {
    const perspective = perspectiveForBank(question.relationshipType)
    if (!perspective) continue
    const draft = findDraft(perspective, question.questionText)
    const key = draft?.key ?? `${perspective}.Q_${question.id}`
    if (draft) {
      // A spec topic now covers this question: retire the generic topic an earlier sync made for its old wording.
      const retired = await db.weeklyCompetency.updateMany({ where: { sourceQuestionId: question.id, key: { not: key }, isActive: true }, data: { isActive: false } })
      replaced += retired.count
    }
    const existing = await db.weeklyCompetency.findUnique({ where: { key } })
    if (existing) {
      // A topic HR removed stays off until HR restores it.
      if (existing.removedAt) continue
      if (existing.sourceQuestionId !== question.id || !existing.isActive) {
        await db.weeklyCompetency.update({ where: { id: existing.id }, data: { sourceQuestionId: question.id, isActive: true } })
        relinked += 1
      }
      continue
    }
    const content = draft ?? draftFromDescriptions({ questionText: question.questionText, descriptions: descriptionsOf(question) })
    await db.weeklyCompetency.create({ data: createData(key, perspective, content, { sourceQuestionId: question.id }, actor.id) })
    created += 1
  }
  const stale = await db.weeklyCompetency.updateMany({
    where: { sourceLeadQuestionId: null, isActive: true, sourceQuestionId: { notIn: questions.map((q) => q.id) } },
    data: { isActive: false },
  })
  await recordAudit(db, { actorId: actor.id, actorRole: 'HR', action: 'CONTENT_SYNC', objectType: 'WeeklyCompetency', after: { created, relinked, deactivated: stale.count + replaced } })
  return { created, relinked, deactivated: stale.count + replaced }
}

function profileView(profile: WeeklyProfile | undefined): ProfileView | null {
  const levels = profile ? parseProfileLevels(profile.levels) : null
  if (!profile || !levels) return null
  return {
    id: profile.id, version: profile.version, status: profile.status, levels, insufficientDefinition: profile.insufficientDefinition,
    incomplete: profile.incomplete, approvedAt: profile.approvedAt?.toISOString() ?? null,
  }
}

type CompetencyWithContent = WeeklyCompetency & { prompts: WeeklyCompetencyPrompt[]; profiles: WeeklyProfile[] }

function toContentCompetency(c: CompetencyWithContent, descriptions: Map<string, Descriptions>, leadNames: Map<string, string>): ContentCompetency {
  const approved = c.profiles.find((p) => p.status === 'APPROVED')
  const draft = c.profiles.find((p) => p.status === 'DRAFT' && (!approved || p.version > approved.version))
  return {
    id: c.id, key: c.key, perspective: c.perspective, name: c.name, definition: c.definition,
    custom: c.sourceLeadQuestionId !== null,
    leadName: c.leadId ? leadNames.get(c.leadId) ?? null : null,
    ready: Boolean(approved) && c.prompts.some((p) => p.isActive),
    prompts: c.prompts.map((p) => ({ id: p.id, variant: p.variant, text: p.text, isActive: p.isActive })),
    approved: profileView(approved),
    draft: profileView(draft),
    hrDescriptions: descriptions.get(c.sourceQuestionId ?? c.sourceLeadQuestionId ?? '') ?? NO_DESCRIPTIONS,
  }
}

export async function contentView(actor: WeeklyActor): Promise<ContentResponse> {
  assertHr(actor)
  const competencies = await prisma.weeklyCompetency.findMany({
    where: { isActive: true },
    include: { prompts: { where: { archivedAt: null }, orderBy: { variant: 'asc' } }, profiles: { orderBy: { version: 'desc' } } },
    orderBy: [{ perspective: 'asc' }, { key: 'asc' }],
  })
  const [questions, leadQuestions, people] = await Promise.all([
    prisma.evaluationQuestion.findMany({ where: { id: { in: competencies.flatMap((c) => (c.sourceQuestionId ? [c.sourceQuestionId] : [])) } } }),
    prisma.preEvaluationLeadQuestion.findMany({ where: { id: { in: competencies.flatMap((c) => (c.sourceLeadQuestionId ? [c.sourceLeadQuestionId] : [])) } } }),
    loadPeople(competencies.flatMap((c) => (c.leadId ? [c.leadId] : []))),
  ])
  const descriptions = new Map([...questions, ...leadQuestions].map((q) => [q.id, descriptionsOf(q)]))
  const leadNames = new Map([...people.values()].map((p) => [p.id, p.name]))
  const removed = await prisma.weeklyCompetency.findMany({ where: { removedAt: { not: null } }, orderBy: [{ perspective: 'asc' }, { name: 'asc' }] })
  return {
    competencies: competencies.map((c) => toContentCompetency(c, descriptions, leadNames)),
    removed: removed.map((c) => ({ id: c.id, perspective: c.perspective, name: c.name, removedAt: (c.removedAt as Date).toISOString() })),
  }
}

export async function updatePrompt(actor: WeeklyActor, promptId: string, input: { text?: string; isActive?: boolean }): Promise<void> {
  assertHr(actor)
  const prompt = await prisma.weeklyCompetencyPrompt.findUnique({ where: { id: promptId } })
  if (!prompt) throw new WeeklyError('Question not found', 404)
  if (input.isActive === false) {
    const others = await prisma.weeklyCompetencyPrompt.count({ where: { competencyId: prompt.competencyId, isActive: true, id: { not: prompt.id } } })
    if (others === 0) throw new WeeklyError('Keep at least one active question for each topic', 409)
  }
  await prisma.$transaction(async (tx) => {
    await tx.weeklyCompetencyPrompt.update({
      where: { id: prompt.id },
      data: { ...(input.text !== undefined ? { text: input.text } : {}), ...(input.isActive !== undefined ? { isActive: input.isActive } : {}) },
    })
    await recordAudit(tx, {
      actorId: actor.id, actorRole: 'HR', action: 'PROMPT_EDIT', objectType: 'WeeklyCompetencyPrompt', objectId: prompt.id,
      before: { text: prompt.text, isActive: prompt.isActive }, after: input,
    })
  })
}

/** Edits the open draft, or starts a new draft version from HR's text. */
export async function saveProfileDraft(actor: WeeklyActor, competencyId: string, input: ProfileDraftInput): Promise<WeeklyProfile> {
  assertHr(actor)
  const competency = await prisma.weeklyCompetency.findUnique({ where: { id: competencyId }, include: { profiles: { orderBy: { version: 'desc' }, take: 1 } } })
  if (!competency) throw new WeeklyError('Topic not found', 404)
  const latest = competency.profiles[0]
  return prisma.$transaction(async (tx) => {
    const data = { levels: toJson(input.levels), insufficientDefinition: input.insufficientDefinition, incomplete: false }
    const profile =
      latest?.status === 'DRAFT'
        ? await tx.weeklyProfile.update({ where: { id: latest.id }, data })
        : await tx.weeklyProfile.create({ data: { ...data, competencyId, version: (latest?.version ?? 0) + 1, createdById: actor.id } })
    await recordAudit(tx, { actorId: actor.id, actorRole: 'HR', action: 'PROFILE_DRAFT', objectType: 'WeeklyProfile', objectId: profile.id, after: { version: profile.version } })
    return profile
  })
}

export async function approveProfile(actor: WeeklyActor, profileId: string): Promise<void> {
  assertHr(actor)
  const profile = await prisma.weeklyProfile.findUnique({ where: { id: profileId } })
  if (!profile) throw new WeeklyError('Profile not found', 404)
  if (profile.status !== 'DRAFT') throw new WeeklyError('Only a draft can be approved', 409)
  if (!parseProfileLevels(profile.levels)) throw new WeeklyError('This draft is missing level text', 409)
  await prisma.$transaction(async (tx) => {
    await tx.weeklyProfile.updateMany({ where: { competencyId: profile.competencyId, status: 'APPROVED' }, data: { status: 'RETIRED' } })
    await tx.weeklyProfile.update({ where: { id: profile.id }, data: { status: 'APPROVED', approvedById: actor.id, approvedAt: new Date() } })
    await recordAudit(tx, { actorId: actor.id, actorRole: 'HR', action: 'PROFILE_APPROVE', objectType: 'WeeklyProfile', objectId: profile.id, after: { version: profile.version } })
  })
}

/** Leads' custom questions for the cycle's quarter become LEAD topics for that lead's reports only. */
export async function ensureLeadCustomCompetencies(cycle: { id: string; periodId: string }, db: Db = prisma): Promise<number> {
  const preps = await db.preEvaluationLeadPrep.findMany({ where: { periodId: cycle.periodId }, include: { questions: { orderBy: { orderIndex: 'asc' } } } })
  let created = 0
  for (const prep of preps) {
    if (!hasEffectiveLeadQuestionSet(prep)) continue
    for (const question of prep.questions) {
      const existing = await db.weeklyCompetency.findUnique({ where: { sourceLeadQuestionId: question.id } })
      if (existing) continue
      const content = draftFromDescriptions({ questionText: question.questionText, descriptions: descriptionsOf(question) })
      try {
        await db.weeklyCompetency.create({
          data: createData(`CUSTOM.${question.id}`, 'LEAD', content, { sourceLeadQuestionId: question.id, leadId: prep.leadId, cycleId: cycle.id }, null),
        })
        created += 1
      } catch (error) {
        if (!isUniqueViolation(error)) throw error
      }
    }
  }
  return created
}

export async function loadReadyCompetencies(cycleId: string, db: Db = prisma): Promise<ReadyCompetencies> {
  const competencies = await db.weeklyCompetency.findMany({
    where: { isActive: true, OR: [{ cycleId: null }, { cycleId }], profiles: { some: { status: 'APPROVED' } } },
    include: { prompts: { where: { isActive: true }, orderBy: { variant: 'asc' } } },
    orderBy: { key: 'asc' },
  })
  const global = new Map<Perspective, ReadyCompetency[]>()
  const customByLead = new Map<string, ReadyCompetency[]>()
  for (const c of competencies) {
    if (c.prompts.length === 0) continue
    const ready: ReadyCompetency = {
      id: c.id, key: c.key, name: c.name, perspective: c.perspective, leadId: c.leadId,
      prompts: c.prompts.map((p) => ({ id: p.id, variant: p.variant, text: p.text })),
    }
    if (c.leadId) customByLead.set(c.leadId, [...(customByLead.get(c.leadId) ?? []), ready])
    else global.set(c.perspective, [...(global.get(c.perspective) ?? []), ready])
  }
  return { global, customByLead }
}

export async function readyCompetencyCount(db: Db = prisma): Promise<number> {
  const ready = await loadReadyCompetencies('', db)
  return [...ready.global.values()].reduce((sum, list) => sum + list.length, 0)
}
