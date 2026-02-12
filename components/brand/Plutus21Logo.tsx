'use client'

import { cn } from '@/lib/utils'

interface Plutus21LogoProps {
  className?: string
  size?: number
  /** When 'auto', uses currentColor so it inherits from parent text color */
  variant?: 'light' | 'dark' | 'auto'
}

/**
 * Inline SVG Plutus21 logo — no external file loading needed.
 * Renders reliably regardless of theme timing or network.
 */
export function Plutus21Logo({
  className,
  size = 40,
  variant = 'auto',
}: Plutus21LogoProps) {
  const fill =
    variant === 'light'
      ? '#2a2f40'
      : variant === 'dark'
        ? '#e5e7eb'
        : 'currentColor'

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 192.77 300.79"
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      aria-label="Plutus21"
      role="img"
    >
      <rect x="38.29" y="272.48" width="116.19" height="28.31" fill={fill} />
      <path
        d="M182.33,139.86A96.26,96.26,0,0,0,96.39,0h0A96.33,96.33,0,0,0,82.78,191.7C62.55,203.87,41.07,215.48,22,224.89v28.34H170.75V224.89h-92C119.26,201.85,170.39,169.11,182.33,139.86Z"
        fill={fill}
      />
    </svg>
  )
}
