// The leads' sheet: Execution can comment on any KPI, and the lead and owners read and answer in the same thread.
// Anyone who can see a KPI may comment on it; nobody else learns that it exists.
import { prisma } from '@/lib/db'
import { canViewKpi, type KpiActor } from '../permissions'
import type { CommentInput } from '../schemas'
import type { KpiCommentView } from '../view-types'
import { loadKpiContext, personRef } from './context'
import { KpiError } from './errors'
import { findKpi, kpiRefOf } from './kpi-load'

async function assertCanSee(actor: KpiActor, kpiId: string): Promise<void> {
  const [ctx, kpi] = await Promise.all([loadKpiContext(), findKpi(kpiId)])
  if (!canViewKpi(actor, kpiRefOf(kpi), ctx.scope)) throw new KpiError('KPI not found', 404)
}

export async function listKpiComments(actor: KpiActor, kpiId: string): Promise<KpiCommentView[]> {
  await assertCanSee(actor, kpiId)
  const [ctx, rows] = await Promise.all([
    loadKpiContext(),
    prisma.kpiComment.findMany({ where: { kpiId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] }),
  ])
  return rows.map((row) => ({ id: row.id, author: personRef(ctx, row.authorId), body: row.body, createdAt: row.createdAt.toISOString() }))
}

export async function addKpiComment(actor: KpiActor, kpiId: string, input: CommentInput, now: Date = new Date()): Promise<KpiCommentView[]> {
  await assertCanSee(actor, kpiId)
  await prisma.kpiComment.create({ data: { kpiId, authorId: actor.id, body: input.body.trim(), createdAt: now } })
  return listKpiComments(actor, kpiId)
}
