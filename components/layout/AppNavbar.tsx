'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  LogOut,
  Settings,
  Calendar,
  AlertCircle,
  Menu,
  X,
} from 'lucide-react'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetClose,
} from '@/components/ui/sheet'
import { Plutus21Logo } from '@/components/brand/Plutus21Logo'
import { PLATFORM_NAME, COMPANY_NAME } from '@/lib/config'

interface NavLink {
  href: string
  label: string
  icon: React.ReactNode
  variant?: 'default' | 'primary' | 'muted'
}

interface AppNavbarProps {
  user?: { name: string; role: string } | null
  onLogout: () => void
  badge?: string
  navLinks?: NavLink[]
}

export function AppNavbar({ user, onLogout, badge, navLinks = [] }: AppNavbarProps) {
  // Default nav links based on role
  const defaultLinks: NavLink[] = [
    {
      href: '/leave',
      label: 'Leave',
      icon: <Calendar className="w-4 h-4" />,
      variant: 'default',
    },
    {
      href: '/device-support',
      label: 'Device Support',
      icon: <AlertCircle className="w-4 h-4" />,
      variant: 'muted',
    },
  ]

  // Add role-specific links
  if (user?.role === 'HR') {
    defaultLinks.push({
      href: '/admin',
      label: 'Admin',
      icon: <Settings className="w-4 h-4" />,
      variant: 'primary',
    })
  }
  if (user?.role === 'SECURITY') {
    defaultLinks.push({
      href: '/security',
      label: 'Security',
      icon: <Settings className="w-4 h-4" />,
      variant: 'primary',
    })
  }
  if (user?.role === 'OA') {
    defaultLinks.push({
      href: '/oa',
      label: 'O&A',
      icon: <Settings className="w-4 h-4" />,
      variant: 'primary',
    })
    defaultLinks.push({
      href: '/admin',
      label: 'Admin',
      icon: <Settings className="w-4 h-4" />,
      variant: 'muted',
    })
  }

  const links = navLinks.length > 0 ? navLinks : defaultLinks

  const linkStyles = {
    default:
      'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400',
    primary:
      'bg-primary text-primary-foreground hover:opacity-90',
    muted:
      'bg-muted hover:bg-muted/80 text-muted-foreground',
  }

  return (
    <nav className="sticky top-0 z-50 glass border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Left: Logo + Platform */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3"
          >
            <Plutus21Logo size={28} className="text-foreground" />
            <Separator orientation="vertical" className="h-6 hidden sm:block" />
            <div className="hidden sm:flex items-center gap-2">
              <span className="text-lg font-display tracking-tight text-foreground">
                {PLATFORM_NAME}
              </span>
              {badge && (
                <Badge variant="secondary" className="text-xs">
                  {badge}
                </Badge>
              )}
            </div>
          </motion.div>

          {/* Right: Desktop */}
          <div className="hidden md:flex items-center gap-3">
            {user?.name && (
              <span className="text-sm text-muted-foreground">{user.name}</span>
            )}
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-2 px-3 py-2 rounded-button text-sm font-medium transition-colors ${
                  linkStyles[link.variant || 'default']
                }`}
              >
                {link.icon}
                <span>{link.label}</span>
              </Link>
            ))}
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              onClick={onLogout}
              aria-label="Logout"
            >
              <LogOut className="w-5 h-5" />
            </Button>
          </div>

          {/* Right: Mobile */}
          <div className="flex md:hidden items-center gap-2">
            <ThemeToggle />
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open menu">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72 p-0">
                <div className="flex flex-col h-full">
                  {/* Header */}
                  <div className="flex items-center justify-between p-4 border-b border-border">
                    <div className="flex items-center gap-2">
                      <Plutus21Logo size={22} className="text-foreground" />
                      <span className="font-display tracking-tight text-foreground">
                        {PLATFORM_NAME}
                      </span>
                      {badge && (
                        <Badge variant="secondary" className="text-xs">
                          {badge}
                        </Badge>
                      )}
                    </div>
                    <SheetClose asChild>
                      <Button variant="ghost" size="icon" aria-label="Close menu">
                        <X className="w-4 h-4" />
                      </Button>
                    </SheetClose>
                  </div>

                  {/* User info */}
                  {user?.name && (
                    <div className="px-4 py-3 border-b border-border">
                      <p className="text-sm font-medium text-foreground">
                        {user.name}
                      </p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {user.role?.toLowerCase()}
                      </p>
                    </div>
                  )}

                  {/* Nav links */}
                  <div className="flex-1 p-4 space-y-2">
                    {links.map((link) => (
                      <SheetClose key={link.href} asChild>
                        <Link
                          href={link.href}
                          className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors"
                        >
                          {link.icon}
                          {link.label}
                        </Link>
                      </SheetClose>
                    ))}
                  </div>

                  {/* Footer */}
                  <div className="p-4 border-t border-border">
                    <Button
                      variant="outline"
                      className="w-full justify-center gap-2"
                      onClick={onLogout}
                    >
                      <LogOut className="w-4 h-4" />
                      Logout
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </nav>
  )
}
