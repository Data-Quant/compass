'use client'

import { motion, type Variants } from 'framer-motion'
import { cn } from '@/lib/utils'

interface PageTransitionProps {
  children: React.ReactNode
  className?: string
}

const pageVariants: Variants = {
  initial: {
    opacity: 0,
    y: 8,
    filter: 'blur(4px)',
  },
  animate: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
  },
  exit: {
    opacity: 0,
    y: -8,
    filter: 'blur(4px)',
  },
}

const pageTransition = {
  duration: 0.45,
  ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number],
}

export function PageTransition({ children, className }: PageTransitionProps) {
  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={pageVariants}
      transition={pageTransition}
      className={cn(className)}
    >
      {children}
    </motion.div>
  )
}
