export class KpiApiError extends Error {}

async function readResponse<T>(response: Response): Promise<T> {
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : 'Request failed. Reload and try again.'
    throw new KpiApiError(message)
  }
  return data as T
}

export async function kpiRequest<T>(
  url: string,
  options: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: 'no-store',
  })
  return readResponse<T>(response)
}

export async function kpiUpload<T>(url: string, file: File): Promise<T> {
  const form = new FormData()
  form.append('file', file)
  return readResponse<T>(await fetch(url, { method: 'POST', body: form, cache: 'no-store' }))
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}
