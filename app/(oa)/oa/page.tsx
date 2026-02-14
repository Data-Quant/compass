'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { AppNavbar } from '@/components/layout/AppNavbar'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { StatsCard } from '@/components/composed/StatsCard'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Link2, Send, ShieldCheck, Wallet } from 'lucide-react'

function canAccessOa(role: string | null | undefined) {
  return role === 'OA'
}

export default function OaDashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [dashboard, setDashboard] = useState<any>({
    statusCounts: {},
    mappingCounts: {},
    envelopeCounts: {},
    recentPeriods: [],
  })

  useEffect(() => {
    fetch('/api/auth/session')
      .then((res) => res.json())
      .then((data) => {
        if (!data.user || !canAccessOa(data.user.role)) {
          router.push('/login')
          return
        }
        setUser(data.user)
        return loadDashboard()
      })
      .catch(() => router.push('/login'))
  }, [])

  const loadDashboard = async () => {
    try {
      const res = await fetch('/api/payroll/dashboard')
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load payroll dashboard')
      }
      setDashboard(data)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load payroll dashboard')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  if (loading) {
    return <LoadingScreen message="Loading O&A dashboard..." />
  }

  const unresolved = (dashboard.mappingCounts?.UNRESOLVED || 0) + (dashboard.mappingCounts?.AMBIGUOUS || 0)
  const pendingApprovals = dashboard.statusCounts?.CALCULATED || 0
  const docusignQueue = (dashboard.statusCounts?.APPROVED || 0) + (dashboard.statusCounts?.SENDING || 0)

  return (
    <div className="min-h-screen bg-background">
      <AppNavbar user={user} onLogout={handleLogout} badge="O&A" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-display font-semibold text-foreground">O&A Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Manage payroll automation cycles, identity mapping, approvals, and DocuSign dispatch.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4"
        >
          <StatsCard title="Payroll Periods" value={Object.values(dashboard.statusCounts || {}).reduce((a: number, b: any) => a + Number(b || 0), 0)} icon={<Wallet className="w-4 h-4" />} />
          <StatsCard title="Unresolved Mapping" value={unresolved} icon={<Link2 className="w-4 h-4" />} />
          <StatsCard title="Pending Approval" value={pendingApprovals} icon={<ShieldCheck className="w-4 h-4" />} />
          <StatsCard title="DocuSign Queue" value={docusignQueue} icon={<Send className="w-4 h-4" />} />
        </motion.div>

        <div className="grid grid-cols-1 gap-6">
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold font-display mb-2">Payroll Workspace</h2>
              <p className="text-sm text-muted-foreground mb-4">
                Create periods, import workbook data, run calculations, approve, and send receipts.
              </p>
              <Button asChild>
                <Link href="/oa/payroll">Open Payroll Workspace</Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="p-6 border-b border-border">
              <h2 className="text-lg font-semibold font-display">Recent Payroll Periods</h2>
            </div>
            <div className="divide-y divide-border">
              {(dashboard.recentPeriods || []).map((period: any) => (
                <div key={period.id} className="p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">{period.label}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(period.periodStart).toLocaleDateString()} - {new Date(period.periodEnd).toLocaleDateString()}
                    </p>
                  </div>
                  <Button size="sm" asChild>
                    <Link href={`/oa/payroll/${period.id}`}>Open</Link>
                  </Button>
                </div>
              ))}
              {(!dashboard.recentPeriods || dashboard.recentPeriods.length === 0) && (
                <p className="p-6 text-sm text-muted-foreground">No payroll periods found.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
