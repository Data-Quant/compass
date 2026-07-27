'use client'

// tsconfig sets jsx: "preserve", so the test runner compiles this file with the
// classic runtime and needs React in scope.
import React, { useId } from 'react'
import { starFills, starAriaLabel, STAR_COUNT } from '@/lib/stars'

interface StarRatingProps {
  /** Score on the native 0-4 scale. Use scoreToStars() to convert a percentage. */
  stars: number
  size?: number
  className?: string
}

const STAR_PATH =
  'M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z'

/**
 * Four stars filled in proportion to the score, sharing its fill maths with the
 * printed report via lib/stars.ts so both surfaces show the same picture.
 *
 * Fill is continuous: a 3.3 draws three solid stars and the fourth 30% filled.
 */
export function StarRating({ stars, size = 14, className }: StarRatingProps) {
  // Gradient ids are document-global. The reports page renders one of these per
  // employee, so without a unique prefix every card would reuse the first card's
  // fills.
  const instanceId = useId().replace(/:/g, '')

  return (
    <span
      // The unfilled portion is drawn as currentColor so it tracks the theme:
      // text-muted is a near-white in light mode and a near-black in dark.
      className={`inline-flex items-center gap-0.5 text-muted ${className ?? ''}`}
      role="img"
      aria-label={starAriaLabel(stars)}
    >
      {starFills(stars).map((fill, index) => {
        const gradientId = `star-${instanceId}-${index}`
        const offset = `${(fill * 100).toFixed(2)}%`

        return (
          <svg
            key={index}
            width={size}
            height={size}
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
                <stop offset={offset} stopColor="#f0a500" />
                <stop offset={offset} stopColor="currentColor" />
              </linearGradient>
            </defs>
            <path
              d={STAR_PATH}
              fill={`url(#${gradientId})`}
              stroke="#c9a227"
              strokeWidth="0.6"
            />
          </svg>
        )
      })}
    </span>
  )
}

export { STAR_COUNT }
