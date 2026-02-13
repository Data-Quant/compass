'use client'

import { useRef, useState, useCallback, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface GlareCardProps {
  children: ReactNode
  className?: string
  /** Max rotation in degrees (default 3) */
  maxRotation?: number
  /** Glare opacity (0-1, default 0.15) */
  glareOpacity?: number
}

/**
 * 3D perspective tilt card with a cursor-following glare overlay.
 *
 * - rotateY: ((x-50)/50) * maxRotation
 * - rotateX: ((y-50)/50) * -maxRotation * 0.67
 * - Radial gradient glare follows cursor position
 */
export function GlareCard({
  children,
  className,
  maxRotation = 3,
  glareOpacity = 0.15,
}: GlareCardProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [transform, setTransform] = useState('')
  const [glarePos, setGlarePos] = useState({ x: 50, y: 50 })
  const [isHovered, setIsHovered] = useState(false)

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!ref.current) return
      const rect = ref.current.getBoundingClientRect()
      const x = ((e.clientX - rect.left) / rect.width) * 100
      const y = ((e.clientY - rect.top) / rect.height) * 100

      const rotateY = ((x - 50) / 50) * maxRotation
      const rotateX = ((y - 50) / 50) * -maxRotation * 0.67

      setTransform(
        `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`,
      )
      setGlarePos({ x, y })
    },
    [maxRotation],
  )

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false)
    setTransform('')
  }, [])

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true)
  }, [])

  return (
    <div
      ref={ref}
      className={cn('relative overflow-hidden transition-transform duration-200 ease-out', className)}
      style={{ transform: isHovered ? transform : undefined }}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {/* Glare overlay */}
      <div
        className="pointer-events-none absolute inset-0 z-10 transition-opacity duration-300 rounded-[inherit]"
        style={{
          opacity: isHovered ? 1 : 0,
          background: `radial-gradient(circle at ${glarePos.x}% ${glarePos.y}%, rgba(255,255,255,${glareOpacity}), transparent 60%)`,
        }}
      />
    </div>
  )
}
