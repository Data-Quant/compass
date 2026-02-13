'use client'

import { cn } from '@/lib/utils'

interface ProgressiveBlurProps {
  /** Which edge to blur: 'top', 'bottom', or 'both' */
  position?: 'top' | 'bottom' | 'both'
  /** Height of the blur gradient in pixels */
  height?: number
  className?: string
}

/**
 * Gradient mask at scroll container edges.
 * Applies multi-step backdrop-blur layers (1px to 12px) for a smooth fade.
 *
 * Usage: wrap a scrollable container in a relative parent,
 * then place <ProgressiveBlur /> as a sibling.
 */
export function ProgressiveBlur({
  position = 'bottom',
  height = 40,
  className,
}: ProgressiveBlurProps) {
  const layers = [
    { blur: 1, opacity: 0.15 },
    { blur: 2, opacity: 0.25 },
    { blur: 4, opacity: 0.4 },
    { blur: 8, opacity: 0.6 },
    { blur: 12, opacity: 0.85 },
  ]

  const renderEdge = (edge: 'top' | 'bottom') => (
    <div
      key={edge}
      className={cn(
        'pointer-events-none absolute left-0 right-0 z-10',
        edge === 'top' ? 'top-0' : 'bottom-0',
      )}
      style={{ height }}
    >
      {layers.map(({ blur, opacity }, i) => (
        <div
          key={i}
          className="absolute inset-0"
          style={{
            backdropFilter: `blur(${blur}px)`,
            WebkitBackdropFilter: `blur(${blur}px)`,
            maskImage:
              edge === 'bottom'
                ? `linear-gradient(to bottom, transparent, rgba(0,0,0,${opacity}))`
                : `linear-gradient(to top, transparent, rgba(0,0,0,${opacity}))`,
            WebkitMaskImage:
              edge === 'bottom'
                ? `linear-gradient(to bottom, transparent, rgba(0,0,0,${opacity}))`
                : `linear-gradient(to top, transparent, rgba(0,0,0,${opacity}))`,
          }}
        />
      ))}
      {/* Solid background fade for content visibility */}
      <div
        className={cn(
          'absolute inset-0',
          edge === 'bottom'
            ? 'bg-gradient-to-b from-transparent to-background'
            : 'bg-gradient-to-t from-transparent to-background',
        )}
        style={{ opacity: 0.7 }}
      />
    </div>
  )

  return (
    <div className={cn('pointer-events-none', className)}>
      {(position === 'top' || position === 'both') && renderEdge('top')}
      {(position === 'bottom' || position === 'both') && renderEdge('bottom')}
    </div>
  )
}
