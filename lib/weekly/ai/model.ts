import { fakeComplete } from './fake-model'

export interface ModelRequest { system: string; user: string; schemaName: string; schema: object }
export interface ModelResult { value: unknown; inputTokens: number; outputTokens: number }
/** One structured-output call. Implementations: Fireworks (real) and the deterministic stand-in. */
export interface StructuredModel { readonly name: string; complete(request: ModelRequest): Promise<ModelResult> }

export type ModelErrorCode = 'NOT_CONFIGURED' | 'RATE_LIMITED' | 'TIMEOUT' | 'PROVIDER_ERROR' | 'INVALID_OUTPUT'

/** Carries a code only: never the request, the answer text or the credentials. */
export class ModelError extends Error {
  constructor(readonly code: ModelErrorCode) {
    super(code)
    this.name = 'ModelError'
  }

  get retryable(): boolean {
    return this.code !== 'NOT_CONFIGURED'
  }
}

export const FAKE_MODEL_NAME = 'stand-in'

export function fakeModel(): StructuredModel {
  return {
    name: FAKE_MODEL_NAME,
    async complete(request) {
      return { value: fakeComplete(request), inputTokens: 0, outputTokens: 0 }
    },
  }
}
