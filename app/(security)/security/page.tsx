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
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { StatsCard } from '@/components/composed/StatsCard'
import { UserAvatar } from '@/components/composed/UserAvatar'

type TicketStatus = 'OPEN' | 'UNDER_REVIEW' | 'SOLUTION' | 'RESOLVED'

interface DeviceTicket {
  id: string
  title: string
  status: TicketStatus
  priority: string
  createdAt: string
  employee: { id: string; name: string; department: string | null }
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  OPEN: { label: 'Open', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  UNDER_REVIEW: { label: 'Under Review', className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  SOLUTION: { label: 'Solution', className: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
  RESOLVED: { label: 'Resolved', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
}

const PRIORITY_DOT: Record<string, string> = {
  LOW: 'bg-slate-400',
  MEDIUM: 'bg-blue-400',
  HIGH: 'bg-orange-400',
  URGENT: 'bg-red-500',
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

  const actionableTickets = useMemo(
    () => tickets.filter((t) => t.status === 'OPEN' || t.status === 'UNDER_REVIEW'),
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

        {/* Actionable Tickets List */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6"
        >
          <Card className={actionableTickets.length > 0 ? 'border-amber-500/20' : ''}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                  <h2 className="text-lg font-semibold text-foreground font-display">
                    Tickets Requiring Action
                  </h2>
                  {actionableTickets.length > 0 && (
                    <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      {actionableTickets.length}
                    </Badge>
                  )}
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/security/device-tickets" className="gap-1.5">
                    View All <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>

              {actionableTickets.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No tickets require action right now.
                </p>
              ) : (
                <div className="space-y-2 max-h-[350px] overflow-y-auto">
                  {actionableTickets.slice(0, 10).map((ticket) => {
                    const badge = STATUS_BADGE[ticket.status] || STATUS_BADGE.OPEN
                    const priorityDot = PRIORITY_DOT[ticket.priority] || PRIORITY_DOT.MEDIUM
                    return (
                      <Link
                        key={ticket.id}
                        href="/security/device-tickets"
                        className="flex items-center justify-between py-2.5 px-3 rounded-lg hover:bg-muted transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <UserAvatar name={ticket.employee.name} size="xs" />
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-foreground truncate max-w-[250px]">{ticket.title}</p>
                              <span className={`w-2 h-2 rounded-full shrink-0 ${priorityDot}`} title={ticket.priority} />
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {ticket.employee.name}
                              {ticket.employee.department && ` \u00b7 ${ticket.employee.department}`}
                              {' \u00b7 '}
                              {new Date(ticket.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                            </p>
                          </div>
                        </div>
                        <Badge variant="secondary" className={badge.className}>
                          {badge.label}
                        </Badge>
                      </Link>
                    )
                  })}
                </div>
              )}

              {actionableTickets.length > 10 && (
                <p className="text-xs text-muted-foreground text-center mt-2">
                  +{actionableTickets.length - 10} more tickets
                </p>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Quick link card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
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
                      Device Support Queue
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Full ticket management with status updates and solution deadlines.
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
