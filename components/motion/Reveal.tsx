'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { EASE_SOFT } from './ease'

interface RevealProps {
  children: React.ReactNode
  /** Position in a staggered group: each step waits a little longer. */
  index?: number
  className?: string
}

/** A section that rises into place the first time it scrolls into view. */
export function Reveal({ children, index = 0, className }: RevealProps) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      // A child that renders nothing leaves no gap in a spaced stack.
      className={cn('empty:hidden', className)}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -40px 0px' }}
      transition={{ duration: reduce ? 0.15 : 0.6, delay: reduce ? 0 : Math.min(index, 6) * 0.07, ease: EASE_SOFT }}
    >
      {children}
    </motion.div>
  )
}
