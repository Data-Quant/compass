export class WeeklyApiError extends Error {}

export async function weeklyRequest<T>(
  url: string,
  options: { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: 'no-store',
  })
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : 'Request failed. Reload and try again.'
    throw new WeeklyApiError(message)
  }
  return data as T
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

/** HR's preview test tools open someone else's inbox with ?as=<userId>. */
export function withActingAs(url: string, actingAs?: string): string {
  if (!actingAs) return url
  return `${url}${url.includes('?') ? '&' : '?'}as=${encodeURIComponent(actingAs)}`
}
