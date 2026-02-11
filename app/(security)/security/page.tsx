'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Shield, Monitor, Clock, Search, Wrench, CheckCircle2, ArrowRight } from 'lucide-react'
import { PageContainer, PageContent } from '@/components/layout/page-container'
import { PageHeader } from '@/components/layout/page-header'

type TicketStatus = 'OPEN' | 'UNDER_REVIEW' | 'SOLUTION' | 'RESOLVED'

interface DeviceTicket {
  id: string
  status: TicketStatus
}

export default function SecurityDashboardPage() {
  const router = useRouter()
  const [tickets, setTickets] = useState<DeviceTicket[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/auth/session')
      .then((res) => res.json())
      .then((data) => {
        if (!data.user || data.user.role !== 'SECURITY') {
          router.push('/login')
          return
        }
        return loadTickets()
      })
      .catch(() => router.push('/login'))
  }, [])

  const loadTickets = async () => {
    try {
      const res = await fetch('/api/device-tickets')
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load tickets')
      }
      setTickets(data.tickets || [])
    } catch (error) {
      toast.error('Failed to load device support queue')
    } finally {
      setLoading(false)
    }
  }

  const counts = useMemo(() => ({
    total: tickets.length,
    open: tickets.filter((t) => t.status === 'OPEN').length,
    underReview: tickets.filter((t) => t.status === 'UNDER_REVIEW').length,
    solution: tickets.filter((t) => t.status === 'SOLUTION').length,
    resolved: tickets.filter((t) => t.status === 'RESOLVED').length,
  }), [tickets])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full gradient-primary animate-pulse" />
          <p className="text-muted text-sm">Loading security dashboard...</p>
        </motion.div>
      </div>
    )
  }

  return (
    <PageContainer>
      <PageHeader backHref="/dashboard" backLabel="Dashboard" badge="Security" />
      <PageContent>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <h1 className="text-2xl font-bold text-foreground">Security Dashboard</h1>
          <p className="text-muted">Manage device support tickets and security escalations.</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
          {[
            { label: 'Total', count: counts.total, icon: Shield },
            { label: 'Open', count: counts.open, icon: Clock },
            { label: 'Under Review', count: counts.underReview, icon: Search },
            { label: 'Solution', count: counts.solution, icon: Wrench },
            { label: 'Resolved', count: counts.resolved, icon: CheckCircle2 },
          ].map((item) => (
            <div key={item.label} className="glass rounded-xl p-4 border border-border">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted">{item.label}</span>
                <item.icon className="w-4 h-4 text-muted" />
              </div>
              <div className="text-2xl font-bold text-foreground mt-1">{item.count}</div>
            </div>
          ))}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass rounded-xl border border-border p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-slate-500/10 flex items-center justify-center">
                <Monitor className="w-6 h-6 text-slate-600 dark:text-slate-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Device Support</h2>
                <p className="text-sm text-muted">Review tickets, set status, and submit solution with deadlines.</p>
              </div>
            </div>
            <Link
              href="/security/device-tickets"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-600 text-white text-sm font-medium hover:bg-slate-700 transition-colors"
            >
              Open Queue
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </motion.div>
      </PageContent>
    </PageContainer>
  )
}
