'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Plutus21Logo } from '@/components/brand/Plutus21Logo'
import { PLATFORM_NAME } from '@/lib/config'

interface LoadingScreenProps {
  message?: string
  className?: string
  variant?: 'page' | 'section' | 'card'
}

const ease = [0.25, 0.46, 0.45, 0.94] as [number, number, number, number]

/**
 * Compass spinner with needle oscillation and gradient ring.
 */
function CompassSpinner({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 48 : 72

  return (
    <div className="relative" style={{ width: dim, height: dim }}>
      {/* Rotating gradient ring */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            'conic-gradient(from 0deg, transparent 0%, hsl(var(--primary)) 30%, hsl(var(--secondary)) 60%, transparent 100%)',
          mask: 'radial-gradient(farthest-side, transparent calc(100% - 2px), black calc(100% - 2px))',
          WebkitMask:
            'radial-gradient(farthest-side, transparent calc(100% - 2px), black calc(100% - 2px))',
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
      />

      {/* Compass needle (subtle oscillation) */}
      <motion.svg
        viewBox="0 0 48 48"
        className="absolute inset-0 w-full h-full"
        animate={{ rotate: [0, 8, -5, 3, 0] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <polygon points="24,10 22.5,23 25.5,23" fill="hsl(var(--primary))" opacity="0.7" />
        <polygon points="24,38 22.5,25 25.5,25" fill="hsl(var(--muted-foreground))" opacity="0.3" />
        <circle cx="24" cy="24" r="2.5" fill="hsl(var(--primary))" />
        <circle cx="24" cy="24" r="1" fill="hsl(var(--background))" />
      </motion.svg>
    </div>
  )
}

export function LoadingScreen({
  className,
  variant = 'page',
}: LoadingScreenProps) {
  /* ── Card variant: minimal spinner ── */
  if (variant === 'card') {
    return (
      <div className={cn('flex items-center justify-center p-8', className)}>
        <motion.div
          className="w-6 h-6 rounded-full border-2 border-primary/20"
          style={{ borderTopColor: 'hsl(var(--primary))' }}
          animate={{ rotate: 360 }}
          transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
        />
      </div>
    )
  }

  /* ── Section variant: compass only ── */
  if (variant === 'section') {
    return (
      <div className={cn('flex items-center justify-center py-16', className)}>
        <CompassSpinner size="sm" />
      </div>
    )
  }

  /* ── Page variant: compass + subtle brand lockup ── */
  return (
    <div
      className={cn(
        'min-h-screen flex flex-col items-center justify-center bg-background',
        className
      )}
    >
      <motion.div
        className="flex flex-col items-center gap-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease }}
        >
          <CompassSpinner />
        </motion.div>

        <motion.div
          className="flex items-center gap-3"
          initial={{ opacity: 0, filter: 'blur(8px)' }}
          animate={{ opacity: 1, filter: 'blur(0px)' }}
          transition={{ delay: 0.2, duration: 0.5, ease }}
        >
          <Plutus21Logo size={24} className="text-foreground/60" />
          <div className="h-5 w-px bg-border/40" />
          <span className="text-sm font-display tracking-tight text-foreground/60">
            {PLATFORM_NAME}
          </span>
        </motion.div>
      </motion.div>
    </div>
  )
}
