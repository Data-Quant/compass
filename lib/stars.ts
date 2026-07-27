import { RATING_LABELS } from '@/types'

/**
 * Star rendering for employee-facing evaluation reports.
 *
 * Scores are natively on a 0-4 scale: lib/scoring.ts sums weighted contributions
 * on 0-4 and only then derives a percentage as (score / 4) * 100. Stars therefore
 * present the original number rather than a new metric, and each star maps to one
 * point on the rating scale in types/index.ts, so 3 stars reads as its real label,
 * "Exceeds Expectations", instead of a 75% that looks like a failing grade.
 *
 * Fill is continuous, not rounded: a 3.3 shows three solid stars and the fourth
 * filled 30% of the way. Rounding to whole stars would collapse 83% of the company
 * onto an identical display, and even half-stars discard real differences.
 */

export const STAR_COUNT = 4

/** overallScore is the 0-4 aggregate expressed as a percentage, so 25% per star. */
export const PERCENT_PER_STAR = 100 / STAR_COUNT

const STAR_FILLED_COLOR = '#f0a500'
const STAR_EMPTY_COLOR = '#e2e5e9'
const STAR_OUTLINE_COLOR = '#c9a227'

const STAR_PATH =
  'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z'

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** Convert a stored overallScore percentage into a 0-4 star value. */
export function scoreToStars(overallScorePercent: number): number {
  if (!Number.isFinite(overallScorePercent)) {
    return 0
  }

  return clamp(overallScorePercent / PERCENT_PER_STAR, 0, STAR_COUNT)
}

/**
 * How full each star is, left to right, as a 0-1 fraction. A 3.3 yields
 * [1, 1, 1, 0.3].
 */
export function starFills(stars: number, count: number = STAR_COUNT): number[] {
  const value = clamp(Number.isFinite(stars) ? stars : 0, 0, count)

  return Array.from({ length: count }, (_, index) => clamp(value - index, 0, 1))
}

/**
 * The rating label for a star value, taken from the number of *solid* stars so
 * the words can never contradict the picture. Returns null below one full star,
 * which only happens when a report has no ratings yet -- labelling that case
 * "Does Not Meet Expectations" would be a false negative.
 */
export function ratingBandFor(stars: number): { label: string; description: string } | null {
  const solid = Math.floor(clamp(Number.isFinite(stars) ? stars : 0, 0, STAR_COUNT))

  return RATING_LABELS[solid] ?? null
}

/**
 * Inline SVG stars. Each glyph carries its own gradient whose two stops sit at the
 * same offset, producing a hard edge at the fill fraction. SVG is used rather than
 * a CSS overlay because these reports are printed to PDF from the browser, where
 * background-based fills depend on print-color-adjust and can silently drop out.
 */
export function renderStars(
  stars: number,
  options: { idPrefix?: string; size?: number } = {}
): string {
  const { idPrefix = 'star', size = 30 } = options
  // The prefix lands inside an id attribute and a url() reference, so keep it to
  // characters that are safe in both.
  const safePrefix = idPrefix.replace(/[^A-Za-z0-9_-]/g, '') || 'star'

  return starFills(stars)
    .map((fill, index) => {
      // Gradient ids must be unique per glyph, and per widget if a page ever shows
      // more than one, or every star reuses the first gradient it finds.
      const gradientId = `${safePrefix}-fill-${index}`
      const offset = `${(fill * 100).toFixed(2)}%`

      return (
        `<svg class="star" width="${size}" height="${size}" viewBox="0 0 24 24" role="presentation" focusable="false">` +
        `<defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="1" y2="0">` +
        `<stop offset="${offset}" stop-color="${STAR_FILLED_COLOR}" />` +
        `<stop offset="${offset}" stop-color="${STAR_EMPTY_COLOR}" />` +
        `</linearGradient></defs>` +
        `<path d="${STAR_PATH}" fill="url(#${gradientId})" stroke="${STAR_OUTLINE_COLOR}" stroke-width="0.6" />` +
        `</svg>`
      )
    })
    .join('')
}

/** Screen-reader and print-fallback text, e.g. "3.30 out of 4 stars". */
export function starAriaLabel(stars: number): string {
  return `${stars.toFixed(2)} out of ${STAR_COUNT} stars`
}
