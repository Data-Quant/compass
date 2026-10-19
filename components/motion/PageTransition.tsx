'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { EASE_SOFT } from './ease'

/** Fades and lifts a page in on each navigation; mounted from a route group's template.tsx. */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0.15 : 0.5, ease: EASE_SOFT }}
    >
      {children}
    </motion.div>
  )
}
