'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Compass, LogOut, ArrowLeft } from 'lucide-react'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { PLATFORM_NAME, COMPANY_NAME, LOGO } from '@/lib/config'

interface PageHeaderProps {
  backHref: string
  backLabel?: string
  showLogout?: boolean
  onLogout?: () => void
  badge?: string
}

export function PageHeader({ 
  backHref, 
  backLabel = 'Back', 
  showLogout = false,
  onLogout,
  badge
}: PageHeaderProps) {
  return (
    <motion.nav 
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass border-b border-[var(--border)] sticky top-0 z-50"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center gap-4">
            <Link href={backHref} className="flex items-center gap-2 text-muted hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">{backLabel}</span>
            </Link>
            <div className="h-6 w-px bg-border hidden sm:block" />
            <div className="flex items-center gap-3">
              <img src={LOGO.company} alt={COMPANY_NAME} className="h-8 w-auto" />
              <div className="h-6 w-px bg-border hidden sm:block" />
              <div className="hidden sm:flex items-center gap-2">
                <Compass className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span className="text-lg font-semibold text-foreground">{PLATFORM_NAME}</span>
              </div>
              {badge && (
                <span className="px-2 py-0.5 text-xs bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-md font-medium">
                  {badge}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            {showLogout && onLogout && (
              <button
                onClick={onLogout}
                className="flex items-center gap-2 px-3 py-2 text-sm text-muted hover:text-foreground hover:bg-surface rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.nav>
  )
}
