'use client'

import { useRouter } from 'next/navigation'
import { LogOut, Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { UserAvatar } from '@/components/composed/UserAvatar'
import { cn } from '@/lib/utils'

interface TopBarProps {
  user?: { name: string; role: string; department?: string } | null
  onMenuClick?: () => void
  showMenuButton?: boolean
  className?: string
}

export function TopBar({ user, onMenuClick, showMenuButton = false, className }: TopBarProps) {
  const router = useRouter()

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  return (
    <header
      className={cn(
        'sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b border-border bg-card/80 backdrop-blur-sm px-4 sm:px-6',
        className
      )}
    >
      {/* Left: mobile menu button */}
      <div className="flex items-center gap-3">
        {showMenuButton && (
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={onMenuClick}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
        )}
      </div>

      {/* Right: user info + actions */}
      <div className="flex items-center gap-3 ml-auto">
        <ThemeToggle />

        {user && (
          <div className="hidden sm:flex items-center gap-2.5 pl-2 border-l border-border">
            <UserAvatar name={user.name} size="sm" />
            <div className="hidden md:block">
              <p className="text-sm font-medium text-foreground leading-none">{user.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{user.department || user.role}</p>
            </div>
          </div>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={handleLogout}
          aria-label="Logout"
          className="text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  )
}
