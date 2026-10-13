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
import { Handshake, ShieldCheck } from 'lucide-react'
import { withSecurityChecksNav, type SecurityChecksNavAccess } from '@/components/layout/sidebar-nav'

// Context so child pages can access user info
interface LayoutUser {
  id: string
  name: string
  role: string
  onboardingCompleted: boolean
  benefitCategoryId?: string | null
  teamTag?: string | null
  email?: string | null
  discordId?: string | null
  department?: string
  position?: string
  avatarSkinTone?: string | null
  avatarSchemaVersion?: number | null
  avatarBodyFrame?: string | null
  avatarOutfitType?: string | null
  avatarOutfitColor?: string | null
  avatarOutfitAccentColor?: string | null
  avatarHairCategory?: string | null
  avatarHairColor?: string | null
  avatarHeadCoveringType?: string | null
  avatarHeadCoveringColor?: string | null
  avatarAccessories?: unknown
}

const LayoutUserContext = createContext<LayoutUser | null>(null)
export const useLayoutUser = () => useContext(LayoutUserContext)

interface SidebarLayoutProps {
  children: React.ReactNode
  sidebarConfig: SidebarConfig
  onboardingSidebarConfig?: SidebarConfig
  requiredRole?: string | string[]
  /** Optional per-role sidebar, for pages shared by people with different consoles. */
  sidebarConfigByRole?: Partial<Record<string, SidebarConfig>>
}

export function SidebarLayout({
  children,
  sidebarConfig,
  onboardingSidebarConfig,
  requiredRole,
  sidebarConfigByRole,
}: SidebarLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<LayoutUser | null>(null)
  // Clientele is visible only to people assigned to a client, so its nav entry is
  // resolved from data rather than role. Checked live because the session cookie
  // would not reflect a fresh assignment until the next login.
  const [hasClientele, setHasClientele] = useState(false)
  // Security Checks entries appear only when the module is on.
  const [securityChecksAccess, setSecurityChecksAccess] = useState<SecurityChecksNavAccess>({ enabled: false, console: false })
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

        // Non-blocking: a failure here just leaves the section hidden.
        fetch('/api/clientele/access')
          .then((res) => res.json())
          .then((access) => setHasClientele(Boolean(access?.hasAccess)))
          .catch(() => setHasClientele(false))
        fetch('/api/security-checks/me')
          .then((res) => (res.ok ? res.json() : null))
          .then((body: { data?: { enabled?: boolean; capabilities?: { console?: boolean } } } | null) =>
            setSecurityChecksAccess({ enabled: Boolean(body?.data?.enabled), console: Boolean(body?.data?.capabilities?.console) }),
          )
          .catch(() => setSecurityChecksAccess({ enabled: false, console: false }))
        setLoading(false)
      })
      .catch(() => router.push('/login'))
  }, [])

  useEffect(() => {
    if (!user || loading) return
    if (user.onboardingCompleted !== false) return

    const allowedOnboardingPath = pathname.startsWith('/onboarding') || pathname.startsWith('/profile')
    if (!allowedOnboardingPath) {
      router.push('/onboarding')
    }
  }, [loading, pathname, router, user])

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

  const roleSidebarConfig = (user?.role && sidebarConfigByRole?.[user.role]) || sidebarConfig
  const baseSidebarConfig =
    user?.onboardingCompleted === false && onboardingSidebarConfig
      ? onboardingSidebarConfig
      : roleSidebarConfig

  // The admin console has its own Clients page and must not get the employee
  // link: its only top-level item is the dashboard, so an injected entry landed
  // above it and sent HR to the employee view.
  const isAdminConsole =
    baseSidebarConfig.items.some((item) => item.href.startsWith('/admin')) ||
    baseSidebarConfig.groups.some((group) => group.items.some((item) => item.href.startsWith('/admin')))

  // Slotted next to Projects, the other client-facing work item. Left out during
  // onboarding, where the sidebar is deliberately stripped back.
  const effectiveSidebarConfig =
    hasClientele && !isAdminConsole && baseSidebarConfig !== onboardingSidebarConfig
      ? {
          ...baseSidebarConfig,
          items: baseSidebarConfig.items.some((item) => item.href === '/clientele')
            ? baseSidebarConfig.items
            : (() => {
                const items = [...baseSidebarConfig.items]
                const anchor = items.findIndex((item) => item.href === '/projects')
                const entry = { label: 'Clientele', href: '/clientele', icon: Handshake }
                // Append when there is no Projects item rather than guessing an
                // index, which previously put it above the dashboard.
                if (anchor >= 0) items.splice(anchor + 1, 0, entry)
                else items.push(entry)
                return items
              })(),
        }
      : baseSidebarConfig

  const finalSidebarConfig =
    baseSidebarConfig === onboardingSidebarConfig
      ? effectiveSidebarConfig
      : withSecurityChecksNav(effectiveSidebarConfig, securityChecksAccess, ShieldCheck)

  return (
    <LayoutUserContext.Provider value={user}>
      <div className="flex h-screen overflow-hidden bg-background">
        {/* Desktop sidebar */}
        <div className="hidden lg:block shrink-0">
          <AppSidebar
            config={finalSidebarConfig}
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
              config={finalSidebarConfig}
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
