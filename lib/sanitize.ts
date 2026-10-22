// Defense-in-depth helpers for user-supplied text. Values are also consumed by
// email templates, PDF/CSV exports, and future surfaces where React's auto-escape
// does not apply. Strip HTML and control characters at ingest so stored data is
// always safe to render.

const TAG_PATTERN = /<\/?[a-zA-Z][^>]*>/g
// Matches each maximal run of `<` once; a lookahead inside the regex would
// rescan the run from every position (quadratic on '<<<<...').
const ANGLE_RUN = /<+/g
const TAG_START = /[a-zA-Z/!?]/
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

// Plain text only: strip tags until nothing changes (so `<scr<script>ipt>`
// cannot reassemble), then drop any leftover run of `<` that could open a tag
// (followed by a letter, `/`, `!` or `?`). Ordinary text such as "a < b",
// "->" or "<3" is left exactly as before.
export function stripHtml(input: string): string {
  let output = input
  let previous: string
  do {
    previous = output
    output = output.replace(TAG_PATTERN, '')
  } while (output !== previous)
  return output
    .replace(ANGLE_RUN, (run, offset: number, str: string) =>
      TAG_START.test(str.charAt(offset + run.length)) ? '' : run
    )
    .replace(CONTROL_CHARS, '')
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
