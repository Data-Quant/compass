'use client'

import { motion } from 'framer-motion'
import { DotPattern } from '@/components/magicui/dot-pattern'

interface PageContainerProps {
  children: React.ReactNode
  className?: string
}

export function PageContainer({ children, className = '' }: PageContainerProps) {
  return (
    <div className="min-h-screen bg-background">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-gradient-radial from-indigo-500/5 via-transparent to-transparent" />
        <div className="absolute -bottom-1/2 -left-1/2 w-full h-full bg-gradient-radial from-purple-500/5 via-transparent to-transparent" />
        <DotPattern className="opacity-[0.03] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_70%)]" />
      </div>
      <div className={`relative ${className}`}>
        {children}
      </div>
    </div>
  )
}

export function PageContent({ children, className = '' }: PageContainerProps) {
  return (
    <motion.main
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1, ease: [0.25, 0.46, 0.45, 0.94], duration: 0.45 }}
      className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 ${className}`}
    >
      {children}
    </motion.main>
  )
}
