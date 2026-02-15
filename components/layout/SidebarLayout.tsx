'use client'

import { useState, useEffect, createContext, useContext } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { AppSidebar, type SidebarConfig } from '@/components/layout/AppSidebar'
import { TopBar } from '@/components/layout/TopBar'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

// Context so child pages can access user info
interface LayoutUser {
  id: string
  name: string
  role: string
  department?: string
  position?: string
}

const LayoutUserContext = createContext<LayoutUser | null>(null)
export const useLayoutUser = () => useContext(LayoutUserContext)

interface SidebarLayoutProps {
  children: React.ReactNode
  sidebarConfig: SidebarConfig
  requiredRole?: string | string[]
}

export function SidebarLayout({ children, sidebarConfig, requiredRole }: SidebarLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<LayoutUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Close mobile sheet on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  // Load sidebar collapsed state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed')
    if (saved === 'true') setCollapsed(true)
  }, [])

  // Auth check
  useEffect(() => {
    fetch('/api/auth/session')
      .then((res) => res.json())
      .then((data) => {
        if (!data.user) {
          router.push('/login')
          return
        }
        // Check role requirement
        if (requiredRole) {
          const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole]
          if (!roles.includes(data.user.role)) {
            router.push('/dashboard')
            return
          }
        }
        setUser(data.user)
        setLoading(false)
      })
      .catch(() => router.push('/login'))
  }, [])

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem('sidebar-collapsed', String(next))
      return next
    })
  }

  if (loading) {
    return <LoadingScreen message="Loading..." />
  }

  return (
    <LayoutUserContext.Provider value={user}>
      <div className="flex h-screen overflow-hidden bg-background">
        {/* Desktop sidebar */}
        <div className="hidden lg:block shrink-0">
          <AppSidebar
            config={sidebarConfig}
            collapsed={collapsed}
            onToggle={toggleCollapsed}
            userRole={user?.role}
          />
        </div>

        {/* Mobile sidebar */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="left" className="w-[240px] p-0 [&>button:first-child]:hidden">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <AppSidebar
              config={sidebarConfig}
              collapsed={false}
              onToggle={() => setMobileOpen(false)}
              userRole={user?.role}
              className="border-r-0"
            />
          </SheetContent>
        </Sheet>

        {/* Main area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar
            user={user}
            showMenuButton
            onMenuClick={() => setMobileOpen(true)}
          />
          <main className={cn(
            'flex-1 overflow-y-auto',
          )}>
            {children}
          </main>
        </div>
      </div>
    </LayoutUserContext.Provider>
  )
}
