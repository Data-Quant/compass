import { areWeeklyTestToolsEnabled } from '../flag'
import { fireworksModel } from './fireworks'
import { FAKE_MODEL_NAME, fakeModel, type StructuredModel } from './model'

type Env = Record<string, string | undefined>
export type ModelChoice = 'configured' | 'stand-in'

/** The stand-in replaces Fireworks only on the preview (test tools on) with WEEKLY_AI_FAKE=true. */
export function standInForced(env: Env = process.env): boolean {
  return env.WEEKLY_AI_FAKE === 'true' && areWeeklyTestToolsEnabled(env)
}

/** The model that scores live answers: HR's choice, else FIREWORKS_MODEL. The forced stand-in wins; without a key there is none. */
export function activeModelName(activeModel: string | null, env: Env = process.env): string | null {
  if (standInForced(env)) return FAKE_MODEL_NAME
  if (!env.FIREWORKS_API_KEY) return null
  return activeModel || env.FIREWORKS_MODEL || null
}

export function activeModelFor(activeModel: string | null, env: Env = process.env, fetcher?: typeof fetch): StructuredModel | null {
  if (standInForced(env)) return fakeModel()
  const name = activeModelName(activeModel, env)
  return name ? fireworksModelFor(name, env, fetcher) : null
}

/** Environment only. Production code uses `resolveActiveModel` (service layer), which also reads HR's setting. */
export function configuredModel(env: Env = process.env, fetcher?: typeof fetch): StructuredModel | null {
  return activeModelFor(null, env, fetcher)
}

/** A Fireworks client for any model id with the environment's key: calibration runs compare models. */
export function fireworksModelFor(modelId: string, env: Env = process.env, fetcher?: typeof fetch): StructuredModel | null {
  return env.FIREWORKS_API_KEY ? fireworksModel({ apiKey: env.FIREWORKS_API_KEY, model: modelId, fetcher }) : null
}

/** A calibration run's model: the stand-in while the test tools are on, otherwise Fireworks. */
export function calibrationModelFor(modelId: string, env: Env = process.env, fetcher?: typeof fetch): StructuredModel | null {
  if (modelId === FAKE_MODEL_NAME) return areWeeklyTestToolsEnabled(env) ? fakeModel() : null
  return fireworksModelFor(modelId, env, fetcher)
}

/** HR's preview "Score now" can pick the stand-in explicitly (the caller has already checked the test tools). */
export function modelFor(choice: ModelChoice): StructuredModel | null {
  return choice === 'stand-in' ? fakeModel() : configuredModel()
}
