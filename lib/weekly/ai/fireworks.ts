// Fireworks chat completions with JSON-schema output, adapted from the archived pilot's `infer`.
// Server only: the key is read from the environment and never leaves this module.
import { z } from 'zod'
import { ModelError, type StructuredModel } from './model'

export const FIREWORKS_URL = 'https://api.fireworks.ai/inference/v1/chat/completions'
const DEFAULT_TIMEOUT_MS = 45_000
// Reasoning models spend part of this budget thinking before they answer.
const MAX_TOKENS = 8000

const completionSchema = z.object({
  choices: z.array(z.object({ finish_reason: z.string().nullable().optional(), message: z.object({ content: z.string().nullable() }) })).min(1),
  usage: z.object({ prompt_tokens: z.number().optional(), completion_tokens: z.number().optional() }).optional(),
})

/** Reads a JSON object from the model's text, tolerating a code fence or words around it. */
export function parseJsonContent(content: string): unknown {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  const text = (fenced ? fenced[1] : content).trim()
  try {
    return JSON.parse(text)
  } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start === -1 || end <= start) throw new SyntaxError('No JSON object in the model output')
    return JSON.parse(text.slice(start, end + 1))
  }
}

function statusError(status: number): ModelError {
  if (status === 429) return new ModelError('RATE_LIMITED')
  if (status === 401 || status === 403) return new ModelError('NOT_CONFIGURED')
  return new ModelError('PROVIDER_ERROR')
}

export function fireworksModel(options: { apiKey: string; model: string; fetcher?: typeof fetch; timeoutMs?: number }): StructuredModel {
  const fetcher = options.fetcher ?? fetch
  return {
    name: options.model,
    async complete(request) {
      let response: Response
      try {
        response = await fetcher(FIREWORKS_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS),
          body: JSON.stringify({
            model: options.model,
            temperature: 0,
            max_tokens: MAX_TOKENS,
            messages: [{ role: 'system', content: request.system }, { role: 'user', content: request.user }],
            response_format: { type: 'json_schema', json_schema: { name: request.schemaName, schema: request.schema } },
          }),
        })
      } catch (error) {
        const name = error instanceof Error ? error.name : ''
        throw new ModelError(name === 'TimeoutError' || name === 'AbortError' ? 'TIMEOUT' : 'PROVIDER_ERROR')
      }
      if (!response.ok) throw statusError(response.status)
      try {
        const body = completionSchema.parse(await response.json())
        const choice = body.choices[0]
        if (choice.finish_reason !== 'stop' || !choice.message.content) throw new Error('Incomplete completion')
        return {
          value: parseJsonContent(choice.message.content),
          inputTokens: body.usage?.prompt_tokens ?? 0,
          outputTokens: body.usage?.completion_tokens ?? 0,
        }
      } catch {
        throw new ModelError('INVALID_OUTPUT')
      }
    },
  }
}
