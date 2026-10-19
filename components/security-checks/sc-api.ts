export class ScApiError extends Error {}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

/** Calls a Security Checks endpoint and unwraps the { success, data, error } envelope. */
export async function scRequest<T>(url: string, options: { method?: Method; body?: unknown } = {}): Promise<T> {
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: 'no-store',
  })
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
        ? payload.error
        : 'Request failed. Reload and try again.'
    throw new ScApiError(message)
  }
  return (payload as { data: T }).data
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}
