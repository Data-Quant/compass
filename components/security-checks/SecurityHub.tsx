'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
import { ClipboardCheck, LayoutDashboard, Monitor, Settings, ShieldCheck, Wrench } from 'lucide-react'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import DeviceSupportWorkspace from '@/components/device-support/DeviceSupportWorkspace'
import DeviceTicketsWorkspace from '@/components/device-support/DeviceTicketsWorkspace'
import { useLayoutUser } from '@/components/layout/SidebarLayout'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { canManageSupport } from '@/lib/permissions'
import { AdminPanel } from './console/AdminPanel'
import { ConsoleHome } from './console/ConsoleHome'
import { ReviewQueue } from './console/ReviewQueue'
import { useScMe, type ScMe } from './console/use-sc-me'
import { MyChecksWorkspace } from './MyChecksWorkspace'

type TabId = 'overview' | 'review' | 'tickets' | 'admin' | 'checks' | 'support'

interface TabDef {
  id: TabId
  label: string
  icon: LucideIcon
  visible: (me: ScMe, role: string | undefined) => boolean
  render: () => React.ReactNode
}

const hasConsole = (me: ScMe) => Boolean(me.enabled && me.capabilities?.console)

// Order: management tabs first for the Security team, then everyone's own.
const TABS: readonly TabDef[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, visible: hasConsole, render: () => <ConsoleHome /> },
  { id: 'review', label: 'Review queue', icon: ClipboardCheck, visible: hasConsole, render: () => <ReviewQueue /> },
  { id: 'tickets', label: 'Device tickets', icon: Wrench, visible: (_me, role) => canManageSupport(role), render: () => <DeviceTicketsWorkspace embedded /> },
  { id: 'admin', label: 'Admin', icon: Settings, visible: hasConsole, render: () => <AdminPanel /> },
  { id: 'checks', label: 'My checks', icon: ShieldCheck, visible: (me) => me.enabled, render: () => <MyChecksWorkspace /> },
  { id: 'support', label: 'Device support', icon: Monitor, visible: () => true, render: () => <DeviceSupportWorkspace embedded /> },
]

/** One Security screen: security checks, the console and device support, as tabs by role. */
export function SecurityHub() {
  const me = useScMe()
  const user = useLayoutUser()
  const router = useRouter()
  const params = useSearchParams()

  if (!me) return <LoadingScreen message="Loading Security..." />
  const tabs = TABS.filter((tab) => tab.visible(me, user?.role))
  const requested = params.get('tab')
  const fallback: TabId = hasConsole(me) ? 'overview' : me.enabled ? 'checks' : 'support'
  const active = tabs.find((tab) => tab.id === requested) ?? tabs.find((tab) => tab.id === fallback) ?? tabs[0]

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 sm:p-8">
      <h1 className="flex items-center gap-2 font-display text-2xl font-bold text-foreground">
        <ShieldCheck className="h-6 w-6" aria-hidden /> Security
      </h1>
      <Tabs value={active.id} onValueChange={(value) => router.replace(`/security-checks?tab=${value}`, { scroll: false })}>
        <TabsList className="h-auto flex-wrap justify-start">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="gap-2">
              <tab.icon className="h-4 w-4" aria-hidden /> {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {/* Only the active tab is mounted, so each tab loads its data when opened. */}
      <div key={active.id}>{active.render()}</div>
    </div>
  )
}
