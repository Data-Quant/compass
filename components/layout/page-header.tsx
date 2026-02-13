'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { LogOut, ArrowLeft } from 'lucide-react'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Plutus21Logo } from '@/components/brand/Plutus21Logo'
import { PLATFORM_NAME, COMPANY_NAME } from '@/lib/config'

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
  badge,
}: PageHeaderProps) {
  return (
    <motion.nav
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass border-b border-border sticky top-0 z-50"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center gap-4">
            <Link
              href={backHref}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">{backLabel}</span>
            </Link>
            <Separator orientation="vertical" className="h-6 hidden sm:block" />
            <div className="flex items-center gap-3">
              <Plutus21Logo size={28} className="text-foreground" />
              <Separator orientation="vertical" className="h-6 hidden sm:block" />
              <div className="hidden sm:flex items-center gap-2">
                <span className="text-lg font-display tracking-tight text-foreground">
                  {PLATFORM_NAME}
                </span>
              </div>
              {badge && (
                <Badge variant="secondary" className="text-xs">
                  {badge}
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            {showLogout && onLogout && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onLogout}
                className="gap-2"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </motion.nav>
  )
}
