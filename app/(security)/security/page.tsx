'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Shield,
  Monitor,
  Clock,
  Search,
  Wrench,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { StatsCard } from '@/components/composed/StatsCard'

type TicketStatus = 'OPEN' | 'UNDER_REVIEW' | 'SOLUTION' | 'RESOLVED'

interface DeviceTicket {
  id: string
  status: TicketStatus
}

export default function SecurityDashboardPage() {
  const [tickets, setTickets] = useState<DeviceTicket[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadTickets()
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

  const counts = useMemo(
    () => ({
      total: tickets.length,
      open: tickets.filter((t) => t.status === 'OPEN').length,
      underReview: tickets.filter((t) => t.status === 'UNDER_REVIEW').length,
      solution: tickets.filter((t) => t.status === 'SOLUTION').length,
      resolved: tickets.filter((t) => t.status === 'RESOLVED').length,
    }),
    [tickets]
  )

  if (loading) {
    return <LoadingScreen message="Loading security dashboard..." />
  }

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <h1 className="text-2xl font-bold text-foreground font-display">
            Security Dashboard
          </h1>
          <p className="text-muted-foreground">
            Manage device support tickets and security escalations.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6"
        >
          <StatsCard
            title="Total"
            value={counts.total}
            icon={<Shield className="w-4 h-4" />}
          />
          <StatsCard
            title="Open"
            value={counts.open}
            icon={<Clock className="w-4 h-4" />}
          />
          <StatsCard
            title="Under Review"
            value={counts.underReview}
            icon={<Search className="w-4 h-4" />}
          />
          <StatsCard
            title="Solution"
            value={counts.solution}
            icon={<Wrench className="w-4 h-4" />}
          />
          <StatsCard
            title="Resolved"
            value={counts.resolved}
            icon={<CheckCircle2 className="w-4 h-4" />}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Card>
            <CardContent className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                    <Monitor className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-foreground font-display">
                      Device Support
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Review tickets, set status, and submit solution with
                      deadlines.
                    </p>
                  </div>
                </div>
                <Button asChild>
                  <Link
                    href="/security/device-tickets"
                    className="inline-flex items-center gap-2"
                  >
                    Open Queue
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
    </div>
  )
}
