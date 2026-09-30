// Part D §3–§4: how far the AI agrees with a target, a run's summary, the trust gate (D10), prices and cost. Pure.
import { z } from 'zod'

export const CALIBRATION_MIN_ITEMS = 40
export const GATE_MAX_ERROR_SHARE = 0.05
export const GATE_MIN_WITHIN_ONE = 0.9
export const GATE_MIN_EXACT = 0.7
export const MODEL_ID_PATTERN = /^accounts\/[a-z0-9-]+\/models\/[a-z0-9._-]+$/

export function isValidModelId(value: string): boolean {
  return MODEL_ID_PATTERN.test(value)
}

/** A sufficiency and a 1–4 score (null when insufficient, or when an error left no result). */
export interface Judgement { sufficiency: string | null; score: number | null }

/** Exact: both insufficient, or both sufficient with the same score. Within one: scores at most one apart. A sufficiency mismatch is neither. */
export function agreement(target: Judgement, ai: Judgement): { exact: boolean; withinOne: boolean } {
  if (target.sufficiency === 'INSUFFICIENT' && ai.sufficiency === 'INSUFFICIENT') return { exact: true, withinOne: true }
  if (target.sufficiency !== 'SUFFICIENT' || ai.sufficiency !== 'SUFFICIENT' || target.score === null || ai.score === null) {
    return { exact: false, withinOne: false }
  }
  const gap = Math.abs(target.score - ai.score)
  return { exact: gap === 0, withinOne: gap <= 1 }
}

export interface ModelPrice { inputPerMillion: number; outputPerMillion: number }
export type ModelPrices = Record<string, ModelPrice>
const priceSchema = z.object({ inputPerMillion: z.number().finite().min(0), outputPerMillion: z.number().finite().min(0) })

/** The settings row's JSON. A malformed entry is dropped rather than breaking every cost figure. */
export function parsePrices(value: unknown): ModelPrices {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const entries = Object.entries(value as Record<string, unknown>).flatMap(([model, price]): Array<[string, ModelPrice]> => {
    const parsed = priceSchema.safeParse(price)
    return parsed.success ? [[model, parsed.data]] : []
  })
  return Object.fromEntries(entries)
}

/** US dollars; null when tokens were used and the model has no price. */
export function costUsd(tokens: { inputTokens: number; outputTokens: number }, price: ModelPrice | undefined): number | null {
  if (tokens.inputTokens === 0 && tokens.outputTokens === 0) return 0
  if (!price) return null
  return (tokens.inputTokens * price.inputPerMillion + tokens.outputTokens * price.outputPerMillion) / 1_000_000
}

export interface CalibrationRow {
  topic: string
  target: Judgement
  ai: Judgement
  error: string | null
  inputTokens: number
  outputTokens: number
  latencyMs: number
}
export interface TopicAgreement { topic: string; compared: number; exact: number; withinOne: number }
export interface CalibrationSummary {
  items: number
  /** Items with a result. Errors are counted but never compared. */
  compared: number
  errors: number
  exact: number
  withinOne: number
  exactRate: number | null
  withinOneRate: number | null
  inputTokens: number
  outputTokens: number
  costUsd: number | null
  avgLatencyMs: number | null
  byTopic: TopicAgreement[]
  /** Why a FAILED run could not finish. */
  failure: string | null
}

const share = (count: number, total: number): number | null => (total > 0 ? count / total : null)

export function summarizeCalibration(rows: readonly CalibrationRow[], price: ModelPrice | undefined, failure: string | null = null): CalibrationSummary {
  const compared = rows.filter((r) => r.error === null)
  const matches = compared.map((r) => ({ topic: r.topic, ...agreement(r.target, r.ai) }))
  const topics = new Map<string, TopicAgreement>()
  for (const m of matches) {
    const t = topics.get(m.topic) ?? { topic: m.topic, compared: 0, exact: 0, withinOne: 0 }
    topics.set(m.topic, { topic: m.topic, compared: t.compared + 1, exact: t.exact + (m.exact ? 1 : 0), withinOne: t.withinOne + (m.withinOne ? 1 : 0) })
  }
  const exact = matches.filter((m) => m.exact).length
  const withinOne = matches.filter((m) => m.withinOne).length
  const tokens = { inputTokens: rows.reduce((sum, r) => sum + r.inputTokens, 0), outputTokens: rows.reduce((sum, r) => sum + r.outputTokens, 0) }
  const latency = compared.reduce((sum, r) => sum + r.latencyMs, 0)
  return {
    items: rows.length, compared: compared.length, errors: rows.length - compared.length, exact, withinOne,
    exactRate: share(exact, compared.length), withinOneRate: share(withinOne, compared.length),
    ...tokens, costUsd: costUsd(tokens, price),
    avgLatencyMs: compared.length > 0 ? Math.round(latency / compared.length) : null,
    byTopic: [...topics.values()].sort((a, b) => a.topic.localeCompare(b.topic)),
    failure,
  }
}

const nullableNumber = z.number().nullable()
const summarySchema = z.object({
  items: z.number(), compared: z.number(), errors: z.number(), exact: z.number(), withinOne: z.number(),
  exactRate: nullableNumber, withinOneRate: nullableNumber, inputTokens: z.number(), outputTokens: z.number(),
  costUsd: nullableNumber, avgLatencyMs: nullableNumber,
  byTopic: z.array(z.object({ topic: z.string(), compared: z.number(), exact: z.number(), withinOne: z.number() })),
  failure: z.string().nullable(),
})

/** A run's stored summary, or null when it is missing or unreadable. */
export function parseSummary(value: unknown): CalibrationSummary | null {
  const parsed = summarySchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export interface GateResult { passed: boolean; reasons: string[] }
const pct = (value: number) => `${Math.round(value * 100)}%`

/** D10: a model is trusted when its latest completed calibration-set run passes every check. */
export function gateResult(summary: CalibrationSummary): GateResult {
  const reasons = [
    summary.failure,
    summary.compared < CALIBRATION_MIN_ITEMS ? `Only ${summary.compared} items were scored; at least ${CALIBRATION_MIN_ITEMS} are needed` : null,
    summary.items > 0 && summary.errors / summary.items > GATE_MAX_ERROR_SHARE
      ? `Errors on ${pct(summary.errors / summary.items)} of items; at most ${pct(GATE_MAX_ERROR_SHARE)} are allowed`
      : null,
    (summary.withinOneRate ?? 0) < GATE_MIN_WITHIN_ONE ? `Within one level on ${pct(summary.withinOneRate ?? 0)}; at least ${pct(GATE_MIN_WITHIN_ONE)} is needed` : null,
    (summary.exactRate ?? 0) < GATE_MIN_EXACT ? `Exact on ${pct(summary.exactRate ?? 0)}; at least ${pct(GATE_MIN_EXACT)} is needed` : null,
  ].filter((reason): reason is string => reason !== null)
  return { passed: reasons.length === 0, reasons }
}
