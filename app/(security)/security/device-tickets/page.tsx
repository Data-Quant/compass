'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Monitor,
  Search,
  Wrench,
  CheckCircle2,
  Plus,
  Filter,
  User,
  Shield,
  Clock,
} from 'lucide-react'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { StatsCard } from '@/components/composed/StatsCard'

interface DeviceTicket {
  id: string
  title: string
  description: string
  deviceType: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  status: 'OPEN' | 'UNDER_REVIEW' | 'SOLUTION' | 'RESOLVED'
  solution: string | null
  expectedResolutionDate: string | null
  hrAssignedTo: string | null
  resolvedAt: string | null
  createdAt: string
  updatedAt: string
  employee: {
    id: string
    name: string
    department: string | null
    position: string | null
    email: string | null
  }
}

const PRIORITY_CONFIG = {
  LOW: {
    label: 'Low',
    color: 'text-slate-600 dark:text-slate-400',
    bg: 'bg-slate-100 dark:bg-slate-500/20',
  },
  MEDIUM: {
    label: 'Medium',
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-100 dark:bg-blue-500/20',
  },
  HIGH: {
    label: 'High',
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-100 dark:bg-amber-500/20',
  },
  URGENT: {
    label: 'Urgent',
    color: 'text-red-600 dark:text-red-400',
    bg: 'bg-red-100 dark:bg-red-500/20',
  },
}

const STATUS_CONFIG = {
  OPEN: {
    label: 'Open',
    color: 'text-blue-600 dark:text-blue-400',
    bg: 'bg-blue-100 dark:bg-blue-500/20',
    icon: Plus,
  },
  UNDER_REVIEW: {
    label: 'Under Review',
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-100 dark:bg-amber-500/20',
    icon: Search,
  },
  SOLUTION: {
    label: 'Solution',
    color: 'text-purple-600 dark:text-purple-400',
    bg: 'bg-purple-100 dark:bg-purple-500/20',
    icon: Wrench,
  },
  RESOLVED: {
    label: 'Resolved',
    color: 'text-green-600 dark:text-green-400',
    bg: 'bg-green-100 dark:bg-green-500/20',
    icon: CheckCircle2,
  },
}

const STATUS_FLOW: Record<string, string> = {
  OPEN: 'UNDER_REVIEW',
  UNDER_REVIEW: 'SOLUTION',
  SOLUTION: 'RESOLVED',
}

export default function SecurityDeviceTicketsPage() {
  const [tickets, setTickets] = useState<DeviceTicket[]>([])
  const [allTickets, setAllTickets] = useState<DeviceTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL')

  const [updateModal, setUpdateModal] = useState<{
    open: boolean
    ticket: DeviceTicket | null
  }>({ open: false, ticket: null })
  const [newStatus, setNewStatus] = useState('')
  const [solution, setSolution] = useState('')
  const [expectedResolutionDate, setExpectedResolutionDate] = useState('')
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    loadTickets()
  }, [])

  const loadTickets = async () => {
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'ALL') params.set('status', statusFilter)
      if (priorityFilter !== 'ALL') params.set('priority', priorityFilter)

      const filteredQuery = params.toString()
      const filteredUrl = filteredQuery
        ? `/api/device-tickets?${filteredQuery}`
        : '/api/device-tickets'

      const [filteredResponse, allResponse] = await Promise.all([
        fetch(filteredUrl),
        fetch('/api/device-tickets'),
      ])

      const [filteredData, allData] = await Promise.all([
        filteredResponse.json(),
        allResponse.json(),
      ])

      if (!filteredResponse.ok) {
        throw new Error(
          filteredData.error || 'Failed to load filtered tickets'
        )
      }
      if (!allResponse.ok) {
        throw new Error(allData.error || 'Failed to load ticket stats')
      }

      setTickets(filteredData.tickets || [])
      setAllTickets(allData.tickets || [])
    } catch (error) {
      toast.error('Failed to load tickets')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!loading) {
      loadTickets()
    }
  }, [statusFilter, priorityFilter])

  const openUpdateModal = (ticket: DeviceTicket) => {
    setUpdateModal({ open: true, ticket })
    setNewStatus(STATUS_FLOW[ticket.status] || ticket.status)
    setSolution(ticket.solution || '')
    setExpectedResolutionDate(
      ticket.expectedResolutionDate
        ? new Date(ticket.expectedResolutionDate).toISOString().split('T')[0]
        : ''
    )
  }

  const handleUpdate = async () => {
    if (!updateModal.ticket) return

    const normalizedSolution = solution.trim()
    const normalizedExpectedResolutionDate = expectedResolutionDate.trim()
    if (
      (newStatus === 'SOLUTION' || newStatus === 'RESOLVED') &&
      !normalizedSolution
    ) {
      toast.error(
        'Solution / Response is required for Solution or Resolved status'
      )
      return
    }
    if (
      (newStatus === 'SOLUTION' || newStatus === 'RESOLVED') &&
      !normalizedExpectedResolutionDate
    ) {
      toast.error(
        'Expected resolution date is required for Solution or Resolved status'
      )
      return
    }

    setProcessing(true)
    try {
      const res = await fetch('/api/device-tickets/update', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticketId: updateModal.ticket.id,
          status: newStatus,
          solution: normalizedSolution || undefined,
          expectedResolutionDate:
            normalizedExpectedResolutionDate || undefined,
        }),
      })

      const data = await res.json()

      if (data.success) {
        toast.success(
          `Ticket updated to ${
            STATUS_CONFIG[newStatus as keyof typeof STATUS_CONFIG]?.label ||
            newStatus
          }`
        )
        setUpdateModal({ open: false, ticket: null })
        loadTickets()
      } else {
        toast.error(data.error || 'Failed to update ticket')
      }
    } catch {
      toast.error('Failed to update ticket')
    } finally {
      setProcessing(false)
    }
  }

  const statCounts = {
    total: allTickets.length,
    open: allTickets.filter((t) => t.status === 'OPEN').length,
    underReview: allTickets.filter((t) => t.status === 'UNDER_REVIEW').length,
    solution: allTickets.filter((t) => t.status === 'SOLUTION').length,
    resolved: allTickets.filter((t) => t.status === 'RESOLVED').length,
  }

  if (loading) {
    return <LoadingScreen message="Loading device tickets..." />
  }

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6"
        >
          <StatsCard
            title="Total"
            value={statCounts.total}
            icon={<Shield className="w-4 h-4" />}
          />
          <StatsCard
            title="Open"
            value={statCounts.open}
            icon={<Clock className="w-4 h-4" />}
          />
          <StatsCard
            title="Under Review"
            value={statCounts.underReview}
            icon={<Search className="w-4 h-4" />}
          />
          <StatsCard
            title="Solution"
            value={statCounts.solution}
            icon={<Wrench className="w-4 h-4" />}
          />
          <StatsCard
            title="Resolved"
            value={statCounts.resolved}
            icon={<CheckCircle2 className="w-4 h-4" />}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-wrap gap-3 mb-6"
        >
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Filters:</span>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Statuses</SelectItem>
              <SelectItem value="OPEN">Open</SelectItem>
              <SelectItem value="UNDER_REVIEW">Under Review</SelectItem>
              <SelectItem value="SOLUTION">Solution</SelectItem>
              <SelectItem value="RESOLVED">Resolved</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Priorities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Priorities</SelectItem>
              <SelectItem value="URGENT">Urgent</SelectItem>
              <SelectItem value="HIGH">High</SelectItem>
              <SelectItem value="MEDIUM">Medium</SelectItem>
              <SelectItem value="LOW">Low</SelectItem>
            </SelectContent>
          </Select>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            {tickets.length === 0 ? (
              <CardContent className="p-8 text-center">
                <div className="w-14 h-14 rounded-2xl bg-muted mx-auto mb-3 flex items-center justify-center">
                  <Monitor className="w-7 h-7 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-foreground mb-1 font-display">
                  No tickets found
                </h3>
                <p className="text-sm text-muted-foreground">
                  {statusFilter !== 'ALL' || priorityFilter !== 'ALL'
                    ? 'Try adjusting your filters'
                    : 'No device support tickets have been submitted yet'}
                </p>
              </CardContent>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Employee
                      </TableHead>
                      <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Ticket
                      </TableHead>
                      <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Device
                      </TableHead>
                      <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Priority
                      </TableHead>
                      <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Status
                      </TableHead>
                      <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Expected
                      </TableHead>
                      <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Date
                      </TableHead>
                      <TableHead className="px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tickets.map((ticket) => {
                      const statusConfig = STATUS_CONFIG[ticket.status]
                      const priorityConfig = PRIORITY_CONFIG[ticket.priority]
                      const StatusIcon = statusConfig.icon
                      const canAdvance = ticket.status !== 'RESOLVED'

                      return (
                        <TableRow
                          key={ticket.id}
                          className="hover:bg-muted/50"
                        >
                          <TableCell className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-medium">
                                {ticket.employee.name
                                  .split(' ')
                                  .map((n) => n[0])
                                  .join('')
                                  .slice(0, 2)}
                              </div>
                              <div>
                                <div className="text-sm font-medium text-foreground">
                                  {ticket.employee.name}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {ticket.employee.department || '—'}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3">
                            <div className="max-w-[200px]">
                              <div className="text-sm font-medium text-foreground truncate">
                                {ticket.title}
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {ticket.description}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3 whitespace-nowrap">
                            <span className="text-sm text-foreground">
                              {ticket.deviceType}
                            </span>
                          </TableCell>
                          <TableCell className="px-4 py-3 whitespace-nowrap">
                            <Badge
                              variant="outline"
                              className={`${priorityConfig.bg} ${priorityConfig.color} border-0`}
                            >
                              {priorityConfig.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-4 py-3 whitespace-nowrap">
                            <Badge
                              variant="outline"
                              className={`${statusConfig.bg} ${statusConfig.color} border-0 inline-flex items-center gap-1`}
                            >
                              <StatusIcon className="w-3 h-3" />
                              {statusConfig.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                            {ticket.expectedResolutionDate
                              ? new Date(
                                  ticket.expectedResolutionDate
                                ).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                })
                              : '—'}
                          </TableCell>
                          <TableCell className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                            {new Date(
                              ticket.createdAt
                            ).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </TableCell>
                          <TableCell className="px-4 py-3 whitespace-nowrap">
                            {canAdvance ? (
                              <Button
                                size="sm"
                                onClick={() => openUpdateModal(ticket)}
                              >
                                Update
                              </Button>
                            ) : (
                              <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                                Done
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </motion.div>
      <Modal
        isOpen={updateModal.open}
        onClose={() => setUpdateModal({ open: false, ticket: null })}
        title="Update Device Support Ticket"
        size="md"
      >
        {updateModal.ticket && (
          <div className="space-y-4">
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <User className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium text-foreground text-sm">
                  {updateModal.ticket.employee.name}
                </span>
              </div>
              <p className="font-medium text-foreground">{updateModal.ticket.title}</p>
              <p className="text-sm text-muted-foreground mt-1">
                {updateModal.ticket.description}
              </p>
              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                <span>{updateModal.ticket.deviceType}</span>
                <span>•</span>
                <span
                  className={
                    PRIORITY_CONFIG[updateModal.ticket.priority].color
                  }
                >
                  {PRIORITY_CONFIG[updateModal.ticket.priority].label} Priority
                </span>
                {updateModal.ticket.expectedResolutionDate && (
                  <span>
                    Expected:{' '}
                    {new Date(
                      updateModal.ticket.expectedResolutionDate
                    ).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-status">New Status</Label>
              <Select value={newStatus} onValueChange={setNewStatus}>
                <SelectTrigger id="new-status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OPEN">Open</SelectItem>
                  <SelectItem value="UNDER_REVIEW">Under Review</SelectItem>
                  <SelectItem value="SOLUTION">Solution Provided</SelectItem>
                  <SelectItem value="RESOLVED">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="solution">
                Solution / Response{' '}
                {(newStatus === 'SOLUTION' || newStatus === 'RESOLVED') && (
                  <span className="text-destructive">*</span>
                )}
              </Label>
              <Textarea
                id="solution"
                value={solution}
                onChange={(e) => setSolution(e.target.value)}
                rows={3}
                placeholder="Describe the solution or steps taken..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expected-date">
                Expected Resolution Date{' '}
                {(newStatus === 'SOLUTION' || newStatus === 'RESOLVED') && (
                  <span className="text-destructive">*</span>
                )}
              </Label>
              <Input
                id="expected-date"
                type="date"
                value={expectedResolutionDate}
                onChange={(e) => setExpectedResolutionDate(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setUpdateModal({ open: false, ticket: null })}
              >
                Cancel
              </Button>
              <Button onClick={handleUpdate} disabled={processing}>
                {processing ? 'Updating...' : 'Update Ticket'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
