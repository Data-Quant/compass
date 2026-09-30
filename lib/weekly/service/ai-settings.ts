// Part D §1: which Fireworks model scores answers, and each model's price. One row, id 'default'.
import { prisma } from '@/lib/db'
import { activeModelFor, activeModelName, standInForced } from '../ai/configured'
import type { StructuredModel } from '../ai/model'
import { parsePrices, type ModelPrices } from '../calibration-rules'
import { areWeeklyTestToolsEnabled } from '../flag'
import type { AiSettingsInput } from '../schemas'
import type { AiSettingsResponse } from '../view-types'
import { recordAudit } from './audit'
import { assertHr, loadPeople, type WeeklyActor } from './context'
import { toJson, type Db } from './db'

export const SETTINGS_ID = 'default'
type Env = Record<string, string | undefined>

export interface AiSettings { activeModel: string | null; prices: ModelPrices; updatedById: string | null; updatedAt: Date | null }

export async function loadAiSettings(db: Db = prisma): Promise<AiSettings> {
  const row = await db.weeklyAiSettings.findUnique({ where: { id: SETTINGS_ID } })
  return { activeModel: row?.activeModel ?? null, prices: parsePrices(row?.prices), updatedById: row?.updatedById ?? null, updatedAt: row?.updatedAt ?? null }
}

/** Replaces the environment-only configuredModel() at every production call site. */
export async function resolveActiveModel(env: Env = process.env, fetcher?: typeof fetch): Promise<StructuredModel | null> {
  return activeModelFor((await loadAiSettings()).activeModel, env, fetcher)
}

export async function aiSettingsView(actor: WeeklyActor, env: Env = process.env): Promise<AiSettingsResponse> {
  assertHr(actor)
  const settings = await loadAiSettings()
  const updatedBy = settings.updatedById ? (await loadPeople([settings.updatedById])).get(settings.updatedById)?.name ?? null : null
  return {
    activeModel: settings.activeModel,
    envModel: env.FIREWORKS_MODEL || null,
    effectiveModel: activeModelName(settings.activeModel, env),
    apiKeyConfigured: Boolean(env.FIREWORKS_API_KEY),
    standInForced: standInForced(env),
    standInAvailable: areWeeklyTestToolsEnabled(env),
    prices: Object.entries(settings.prices).map(([model, price]) => ({ model, ...price })).sort((a, b) => a.model.localeCompare(b.model)),
    updatedAt: settings.updatedAt?.toISOString() ?? null,
    updatedBy,
  }
}

type Change = (current: AiSettings) => { activeModel: string | null; prices: ModelPrices }

async function save(actor: WeeklyActor, action: string, change: Change, now: Date): Promise<void> {
  assertHr(actor)
  await prisma.$transaction(async (tx) => {
    // The row is created once and then locked, so two HR edits at the same moment apply one after the other.
    await tx.$executeRaw`INSERT INTO "WeeklyAiSettings" ("id", "prices", "updatedAt") VALUES (${SETTINGS_ID}, '{}'::jsonb, ${now}) ON CONFLICT ("id") DO NOTHING`
    await tx.$queryRaw`SELECT id FROM "WeeklyAiSettings" WHERE id = ${SETTINGS_ID} FOR UPDATE`
    const current = await loadAiSettings(tx)
    const next = change(current)
    await tx.weeklyAiSettings.update({ where: { id: SETTINGS_ID }, data: { activeModel: next.activeModel, prices: toJson(next.prices), updatedById: actor.id, updatedAt: now } })
    await recordAudit(tx, {
      actorId: actor.id, actorRole: 'HR', action, objectType: 'WeeklyAiSettings', objectId: SETTINGS_ID,
      before: { activeModel: current.activeModel, prices: current.prices }, after: next,
    })
  })
}

export async function updateAiSettings(actor: WeeklyActor, input: AiSettingsInput, now: Date): Promise<void> {
  switch (input.action) {
    case 'set-active':
      return save(actor, 'AI_MODEL_SET', (current) => ({ activeModel: input.model, prices: current.prices }), now)
    case 'set-price':
      return save(actor, 'AI_PRICE_SET', (current) => ({
        activeModel: current.activeModel,
        prices: { ...current.prices, [input.model]: { inputPerMillion: input.inputPerMillion, outputPerMillion: input.outputPerMillion } },
      }), now)
    case 'remove-price':
      return save(actor, 'AI_PRICE_REMOVE', (current) => ({
        activeModel: current.activeModel,
        prices: Object.fromEntries(Object.entries(current.prices).filter(([model]) => model !== input.model)),
      }), now)
  }
}
