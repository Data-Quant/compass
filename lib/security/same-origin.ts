export class SameOriginError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SameOriginError'
  }
}

interface HeaderSource {
  get(name: string): string | null
}

/**
 * CSRF defence for state-changing routes. Browsers send Sec-Fetch-Site and
 * Origin on cross-site requests, so rejecting any foreign value blocks forged
 * requests without a token round-trip on the client.
 */
export function assertSameOrigin(headers: HeaderSource, requestUrl: string): void {
  if (headers.get('sec-fetch-site') === 'cross-site') {
    throw new SameOriginError('Cross-origin request rejected')
  }
  const origin = headers.get('origin')
  if (!origin) return
  const host = headers.get('host') || new URL(requestUrl).host
  let parsed: URL
  try {
    parsed = new URL(origin)
  } catch {
    throw new SameOriginError('Invalid request origin')
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.host !== host) {
    throw new SameOriginError('Cross-origin request rejected')
  }
}
