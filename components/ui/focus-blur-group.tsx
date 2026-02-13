'use client'

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/utils'

// ── Context ──

interface FocusBlurContextValue {
  hoveredIndex: number | null
  setHoveredIndex: (index: number | null) => void
}

const FocusBlurContext = createContext<FocusBlurContextValue>({
  hoveredIndex: null,
  setHoveredIndex: () => {},
})

// ── Parent: FocusBlurGroup ──

interface FocusBlurGroupProps {
  children: ReactNode
  className?: string
}

/**
 * Wrap a set of cards so that when one is hovered, siblings blur + shrink.
 */
export function FocusBlurGroup({ children, className }: FocusBlurGroupProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  return (
    <FocusBlurContext.Provider value={{ hoveredIndex, setHoveredIndex }}>
      <div className={cn('relative', className)}>{children}</div>
    </FocusBlurContext.Provider>
  )
}

// ── Child: FocusBlurItem ──

interface FocusBlurItemProps {
  index: number
  children: ReactNode
  className?: string
}

export function FocusBlurItem({ index, children, className }: FocusBlurItemProps) {
  const { hoveredIndex, setHoveredIndex } = useContext(FocusBlurContext)

  const isAnyHovered = hoveredIndex !== null
  const isThisHovered = hoveredIndex === index
  const isBlurred = isAnyHovered && !isThisHovered

  const handleMouseEnter = useCallback(() => setHoveredIndex(index), [index, setHoveredIndex])
  const handleMouseLeave = useCallback(() => setHoveredIndex(null), [setHoveredIndex])

  return (
    <div
      className={cn(
        'transition-all duration-300 ease-out',
        isBlurred && 'blur-[2px] scale-[0.98] opacity-60',
        isThisHovered && 'scale-[1.01]',
        className,
      )}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </div>
  )
}
