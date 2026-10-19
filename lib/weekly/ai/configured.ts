import { areWeeklyTestToolsEnabled } from '../flag'
import { fireworksModel } from './fireworks'
import { FAKE_MODEL_NAME, fakeModel, type StructuredModel } from './model'

type Env = Record<string, string | undefined>

/** The stand-in replaces Fireworks only on the preview (test tools on) with WEEKLY_AI_FAKE=true. */
export function standInForced(env: Env = process.env): boolean {
  return env.WEEKLY_AI_FAKE === 'true' && areWeeklyTestToolsEnabled(env)
}

/** The model that scores answers: HR's choice, else FIREWORKS_MODEL. The forced stand-in wins; without a key there is none. */
export function activeModelName(activeModel: string | null, env: Env = process.env): string | null {
  if (standInForced(env)) return FAKE_MODEL_NAME
  if (!env.FIREWORKS_API_KEY) return null
  return activeModel || env.FIREWORKS_MODEL || null
}

export function activeModelFor(activeModel: string | null, env: Env = process.env, fetcher?: typeof fetch): StructuredModel | null {
  if (standInForced(env)) return fakeModel()
  const name = activeModelName(activeModel, env)
  return name && env.FIREWORKS_API_KEY ? fireworksModel({ apiKey: env.FIREWORKS_API_KEY, model: name, fetcher }) : null
}
