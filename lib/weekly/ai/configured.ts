import { areWeeklyTestToolsEnabled } from '../flag'
import { fireworksModel } from './fireworks'
import { fakeModel, type StructuredModel } from './model'

type Env = Record<string, string | undefined>
export type ModelChoice = 'configured' | 'stand-in'

/**
 * The stand-in model replaces Fireworks only on the preview (test tools on) with WEEKLY_AI_FAKE=true.
 * Returns null when Fireworks is not configured; scoring then fails into HR's manual queue.
 */
export function configuredModel(env: Env = process.env, fetcher?: typeof fetch): StructuredModel | null {
  if (env.WEEKLY_AI_FAKE === 'true' && areWeeklyTestToolsEnabled(env)) return fakeModel()
  if (!env.FIREWORKS_API_KEY || !env.FIREWORKS_MODEL) return null
  return fireworksModel({ apiKey: env.FIREWORKS_API_KEY, model: env.FIREWORKS_MODEL, fetcher })
}

/** HR's preview "Score now" can pick the stand-in explicitly (the caller has already checked the test tools). */
export function modelFor(choice: ModelChoice): StructuredModel | null {
  return choice === 'stand-in' ? fakeModel() : configuredModel()
}
