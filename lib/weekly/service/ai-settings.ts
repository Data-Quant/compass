// Which Fireworks model scores answers. One row, id 'default'; without it the environment's FIREWORKS_MODEL is used.
import { prisma } from '@/lib/db'
import { activeModelFor, activeModelName, standInForced } from '../ai/configured'
import type { StructuredModel } from '../ai/model'
import { recordAudit } from './audit'
import { assertHr, loadPeople, type WeeklyActor } from './context'
import { WeeklyError } from './errors'

export const SETTINGS_ID = 'default'
type Env = Record<string, string | undefined>

export interface AiSettingsView {
  activeModel: string | null
  envModel: string | null
  effectiveModel: string | null
  apiKeyConfigured: boolean
  standInForced: boolean
  updatedAt: string | null
  updatedBy: string | null
}

async function storedModel(): Promise<{ activeModel: string | null; updatedById: string | null; updatedAt: Date | null }> {
  const row = await prisma.weeklyAiSettings.findUnique({ where: { id: SETTINGS_ID } })
  return { activeModel: row?.activeModel ?? null, updatedById: row?.updatedById ?? null, updatedAt: row?.updatedAt ?? null }
}

export async function resolveActiveModel(env: Env = process.env, fetcher?: typeof fetch): Promise<StructuredModel | null> {
  return activeModelFor((await storedModel()).activeModel, env, fetcher)
}

export async function aiSettingsView(actor: WeeklyActor, env: Env = process.env): Promise<AiSettingsView> {
  assertHr(actor)
  const stored = await storedModel()
  const updatedBy = stored.updatedById ? (await loadPeople([stored.updatedById])).get(stored.updatedById)?.name ?? null : null
  return {
    activeModel: stored.activeModel, envModel: env.FIREWORKS_MODEL || null, effectiveModel: activeModelName(stored.activeModel, env),
    apiKeyConfigured: Boolean(env.FIREWORKS_API_KEY), standInForced: standInForced(env),
    updatedAt: stored.updatedAt?.toISOString() ?? null, updatedBy,
  }
}

const MODEL_ID = /^accounts\/[\w.-]+\/models\/[\w.-]+$/

/** HR picks the model by its Fireworks id; null goes back to the environment's model. */
export async function setActiveModel(actor: WeeklyActor, model: string | null, now: Date): Promise<void> {
  assertHr(actor)
  const value = model?.trim() || null
  if (value && !MODEL_ID.test(value)) throw new WeeklyError('Use a Fireworks model id such as accounts/fireworks/models/llama-v3p1-70b-instruct')
  const before = await storedModel()
  await prisma.weeklyAiSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, activeModel: value, updatedById: actor.id, updatedAt: now },
    update: { activeModel: value, updatedById: actor.id, updatedAt: now },
  })
  await recordAudit(prisma, { actorId: actor.id, actorRole: 'HR', action: 'AI_MODEL_SET', objectType: 'WeeklyAiSettings', objectId: SETTINGS_ID, before: { activeModel: before.activeModel }, after: { activeModel: value } })
}
