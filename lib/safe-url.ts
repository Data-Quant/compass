// Allowlist for URLs rendered from user-authored markdown (task descriptions,
// comments). Returns the URL exactly as the old renderer did (as written, or
// with https:// prefixed to bare www.), or null for anything not plainly safe;
// callers then render the text instead of an element.

const RELATIVE_BASE = 'https://relative.invalid'

function safeUrl(value: string, protocols: readonly string[]): string | null {
  const candidate = /^www\./i.test(value) ? `https://${value}` : value
  if (candidate.startsWith('/')) {
    // Same-origin root-relative paths only (our uploaded images). Rejects
    // protocol-relative "//host" and "/\host".
    if (/^\/[/\\]/.test(candidate)) return null
    try {
      const url = new URL(candidate, RELATIVE_BASE)
      return url.origin === RELATIVE_BASE ? candidate : null
    } catch {
      return null
    }
  }
  let url: URL
  try {
    url = new URL(candidate) // absolute only: bare relative paths throw
  } catch {
    return null
  }
  if (!protocols.includes(url.protocol)) return null
  return candidate
}

export function safeLinkHref(value: string): string | null {
  return safeUrl(value, ['http:', 'https:'])
}

export function safeImageSrc(value: string): string | null {
  return safeUrl(value, ['http:', 'https:'])
}
