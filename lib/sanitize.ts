// Defense-in-depth helpers for user-supplied text. Values are also consumed by
// email templates, PDF/CSV exports, and future surfaces where React's auto-escape
// does not apply. Strip HTML and control characters at ingest so stored data is
// always safe to render.

const TAG_PATTERN = /<\/?[a-zA-Z][^>]*>/g
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

export function stripHtml(input: string): string {
  return input.replace(TAG_PATTERN, '').replace(CONTROL_CHARS, '')
}

// For optional fields: passes null/undefined through untouched.
export function stripHtmlOptional<T extends string | null | undefined>(input: T): T {
  if (typeof input !== 'string') return input
  return stripHtml(input) as T
}

// HTML-escape output for contexts that don't auto-escape (email bodies, PDF text).
export function escapeHtml(str: string | null | undefined): string {
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
