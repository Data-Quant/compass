// Defense-in-depth helpers for user-supplied text. Values are also consumed by
// email templates, PDF/CSV exports, and future surfaces where React's auto-escape
// does not apply. Strip HTML and control characters at ingest so stored data is
// always safe to render.

// Matches each maximal run of `<` once; a lookahead inside the regex would
// rescan the run from every position (quadratic on '<<<<...').
const ANGLE_RUN = /<+/g
const TAG_START = /[a-zA-Z/!?]/
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

const isAsciiLetter = (ch: string | undefined) =>
  ch !== undefined && ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z'))

// Removes every `<`, optional `/`, letter, non-`<>` chars, `>` sequence, including
// ones that only form after an inner tag is removed (`<scr<script>ipt>`).
// Single pass with a stack: a tag can only end at `>` and start at the last
// unmatched `<`, so each char is pushed and popped at most once (linear time).
// Gives the same result as repeating /<\/?[a-zA-Z][^<>]*>/g until stable.
function stripTags(input: string): string {
  const out: string[] = []
  const opens: number[] = [] // indexes in `out` of `<` still present
  let lastClose = -1 // index in `out` of the last kept `>`
  for (const ch of input) {
    if (ch === '>') {
      const start = opens.length > 0 ? opens[opens.length - 1] : -1
      if (start > lastClose) {
        const nameAt = out[start + 1] === '/' ? start + 2 : start + 1
        if (isAsciiLetter(out[nameAt])) {
          out.length = start
          opens.pop()
          continue
        }
      }
      lastClose = out.length
    } else if (ch === '<') {
      opens.push(out.length)
    }
    out.push(ch)
  }
  return out.join('')
}

// Plain text only: strip tags (including ones that reassemble, so
// `<scr<script>ipt>` leaves nothing), then drop any leftover run of `<` that
// could open a tag (followed by a letter, `/`, `!` or `?`). Ordinary text such
// as "a < b", "->" or "<3" is left exactly as before.
export function stripHtml(input: string): string {
  return stripTags(input)
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
