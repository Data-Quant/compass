'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { ShimmerButton } from '@/components/magicui/shimmer-button'
import {
  Monitor,
  Plus,
  Clock,
  Search,
  Wrench,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { COMPANY_NAME } from '@/lib/config'

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
}

const DEVICE_TYPES = [
  'Laptop',
  'Monitor',
  'Keyboard',
  'Mouse',
  'Headset',
  'Webcam',
  'Docking Station',
  'Network / Internet',
  'Software',
  'Other',
]

const PRIORITY_CONFIG = {
  LOW: { label: 'Low', color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-100 dark:bg-slate-500/20' },
  MEDIUM: { label: 'Medium', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-500/20' },
  HIGH: { label: 'High', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-500/20' },
  URGENT: { label: 'Urgent', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-500/20' },
}

const STATUS_CONFIG = {
  OPEN: { label: 'Open', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-500/20', icon: Plus },
  UNDER_REVIEW: { label: 'Under Review', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-500/20', icon: Search },
  SOLUTION: { label: 'Solution Provided', color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-100 dark:bg-purple-500/20', icon: Wrench },
  RESOLVED: { label: 'Resolved', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-500/20', icon: CheckCircle2 },
}

export default function DeviceSupportPage() {
  const [tickets, setTickets] = useState<DeviceTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null)

  // Form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [deviceType, setDeviceType] = useState('')
  const [priority, setPriority] = useState('MEDIUM')

  useEffect(() => {
    loadTickets()
  }, [])

  const loadTickets = async () => {
    try {
      const response = await fetch('/api/device-tickets?onlyOwn=true')
      const data = await response.json()
      setTickets(data.tickets || [])
    } catch (error) {
      toast.error('Failed to load tickets')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!title.trim() || !description.trim() || !deviceType) {
      toast.error('Please fill in all required fields')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/device-tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, deviceType, priority }),
      })

      const data = await res.json()

      if (data.success) {
        toast.success('Ticket submitted successfully!')
        setTitle('')
        setDescription('')
        setDeviceType('')
        setPriority('MEDIUM')
        setShowForm(false)
        loadTickets()
      } else {
        toast.error(data.error || 'Failed to submit ticket')
      }
    } catch {
      toast.error('Failed to submit ticket')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6 sm:p-8 max-w-7xl mx-auto">
        <LoadingScreen message="Loading device support..." />
      </div>
    )
  }

  const activeTickets = tickets.filter(t => t.status !== 'RESOLVED')
  const resolvedTickets = tickets.filter(t => t.status === 'RESOLVED')

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 gap-4"
        >
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground mb-2 flex items-center gap-3">
              <Monitor className="w-8 h-8 text-indigo-500" />
              Device Support
            </h1>
            <p className="text-muted-foreground">Report device issues and track your support tickets</p>
          </div>
          <ShimmerButton onClick={() => setShowForm(!showForm)} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            New Ticket
          </ShimmerButton>
        </motion.div>

        {/* Ticket Form */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mb-8"
            >
              <Card className="rounded-card border border-border">
                <CardHeader>
                  <CardTitle>Submit a Support Ticket</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="title">
                          Issue Title <span className="text-red-500">*</span>
                        </Label>
                        <Input
                          id="title"
                          type="text"
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          placeholder="e.g. Laptop screen flickering"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="deviceType">
                          Device Type <span className="text-red-500">*</span>
                        </Label>
                        <Select value={deviceType || '__none__'} onValueChange={(v) => setDeviceType(v === '__none__' ? '' : v)}>
                          <SelectTrigger id="deviceType">
                            <SelectValue placeholder="Select device type..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__" disabled>Select device type...</SelectItem>
                            {DEVICE_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>{type}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="description">
                        Description <span className="text-red-500">*</span>
                      </Label>
                      <Textarea
                        id="description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={4}
                        placeholder="Describe the issue in detail. When does it happen? What have you tried?"
                        className="resize-none"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Priority</Label>
                      <div className="flex gap-2 flex-wrap">
                        {Object.entries(PRIORITY_CONFIG).map(([key, config]) => (
                          <Button
                            key={key}
                            type="button"
                            variant="outline"
                            onClick={() => setPriority(key)}
                            className={cn(
                              priority === key
                                ? `${config.bg} ${config.color} border-current`
                                : 'bg-muted border-border text-muted-foreground hover:bg-muted/80'
                            )}
                          >
                            {config.label}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowForm(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={submitting}
                      >
                        {submitting ? 'Submitting...' : 'Submit Ticket'}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Active Tickets */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-8"
        >
          <h2 className="text-lg font-display font-semibold text-foreground mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-500" />
            Active Tickets
            {activeTickets.length > 0 && (
              <Badge variant="secondary" className="bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 border-0">
                {activeTickets.length}
              </Badge>
            )}
          </h2>

          {activeTickets.length === 0 ? (
            <Card className="rounded-card border border-border">
              <CardContent className="p-8 text-center">
                <div className="w-14 h-14 rounded-card bg-muted mx-auto mb-3 flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7 text-muted-foreground" />
                </div>
                <h3 className="font-semibold text-foreground mb-1">No active tickets</h3>
                <p className="text-sm text-muted-foreground">All caught up! Create a new ticket if you need device support.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {activeTickets.map((ticket, index) => {
                const statusConfig = STATUS_CONFIG[ticket.status]
                const priorityConfig = PRIORITY_CONFIG[ticket.priority]
                const StatusIcon = statusConfig.icon
                const isExpanded = expandedTicket === ticket.id

                return (
                  <motion.div
                    key={ticket.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                  >
                    <Card className="rounded-card border border-border overflow-hidden">
                      <button
                        onClick={() => setExpandedTicket(isExpanded ? null : ticket.id)}
                        className="w-full p-4 flex items-center gap-4 text-left hover:bg-muted/50 transition-colors"
                      >
                        <div className={cn("w-10 h-10 rounded-card flex items-center justify-center flex-shrink-0", statusConfig.bg)}>
                          <StatusIcon className={cn("w-5 h-5", statusConfig.color)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-foreground truncate">{ticket.title}</h4>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground">{ticket.deviceType}</span>
                            <span className="text-border">•</span>
                            <span className={cn("text-xs", priorityConfig.color)}>{priorityConfig.label}</span>
                            <span className="text-border">•</span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(ticket.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                        </div>
                        <Badge variant="secondary" className={cn("border-0", statusConfig.bg, statusConfig.color)}>
                          {statusConfig.label}
                        </Badge>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        )}
                      </button>

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: 'auto' }}
                            exit={{ height: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="px-4 pb-4 pt-0 border-t border-border">
                              <div className="mt-3 space-y-3">
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                                  <p className="text-sm text-foreground whitespace-pre-wrap">{ticket.description}</p>
                                </div>
                                {ticket.hrAssignedTo && (
                                  <div>
                                    <p className="text-xs font-medium text-muted-foreground mb-1">Assigned to</p>
                                    <p className="text-sm text-foreground">{ticket.hrAssignedTo}</p>
                                  </div>
                                )}
                                {ticket.expectedResolutionDate && (
                                  <div>
                                    <p className="text-xs font-medium text-muted-foreground mb-1">Expected resolution date</p>
                                    <p className="text-sm text-foreground">
                                      {new Date(ticket.expectedResolutionDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </p>
                                  </div>
                                )}
                                {ticket.solution && (
                                  <div className="p-3 bg-purple-50 dark:bg-purple-500/10 rounded-lg">
                                    <p className="text-xs font-medium text-purple-700 dark:text-purple-400 mb-1">Solution</p>
                                    <p className="text-sm text-purple-800 dark:text-purple-300 whitespace-pre-wrap">{ticket.solution}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </Card>
                  </motion.div>
                )
              })}
            </div>
          )}
        </motion.div>

        {/* Resolved Tickets */}
        {resolvedTickets.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <h2 className="text-lg font-display font-semibold text-foreground mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              Resolved
              <Badge variant="secondary" className="bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400 border-0">
                {resolvedTickets.length}
              </Badge>
            </h2>

            <div className="space-y-3">
              {resolvedTickets.map((ticket, index) => {
                const priorityConfig = PRIORITY_CONFIG[ticket.priority]
                const isExpanded = expandedTicket === ticket.id

                return (
                  <motion.div
                    key={ticket.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 + index * 0.05 }}
                  >
                    <Card className="rounded-card border border-border overflow-hidden opacity-75 hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setExpandedTicket(isExpanded ? null : ticket.id)}
                        className="w-full p-4 flex items-center gap-4 text-left hover:bg-muted/50 transition-colors"
                      >
                        <div className="w-10 h-10 rounded-card bg-green-100 dark:bg-green-500/20 flex items-center justify-center flex-shrink-0">
                          <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-foreground truncate">{ticket.title}</h4>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-xs text-muted-foreground">{ticket.deviceType}</span>
                            <span className="text-border">•</span>
                            <span className={cn("text-xs", priorityConfig.color)}>{priorityConfig.label}</span>
                            <span className="text-border">•</span>
                            <span className="text-xs text-muted-foreground">
                              Resolved {ticket.resolvedAt ? new Date(ticket.resolvedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                            </span>
                          </div>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        )}
                      </button>

                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: 'auto' }}
                            exit={{ height: 0 }}
                            className="overflow-hidden"
                          >
                            <div className="px-4 pb-4 pt-0 border-t border-border">
                              <div className="mt-3 space-y-3">
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                                  <p className="text-sm text-foreground whitespace-pre-wrap">{ticket.description}</p>
                                </div>
                                {ticket.solution && (
                                  <div className="p-3 bg-green-50 dark:bg-green-500/10 rounded-lg">
                                    <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">Solution</p>
                                    <p className="text-sm text-green-800 dark:text-green-300 whitespace-pre-wrap">{ticket.solution}</p>
                                  </div>
                                )}
                                {ticket.expectedResolutionDate && (
                                  <div>
                                    <p className="text-xs font-medium text-muted-foreground mb-1">Expected resolution date</p>
                                    <p className="text-sm text-foreground">
                                      {new Date(ticket.expectedResolutionDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </Card>
                  </motion.div>
                )
              })}
            </div>
          </motion.div>
        )}

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="mt-16 flex items-center justify-center gap-2 text-xs text-muted-foreground/50"
        >
          <span>Powered by {COMPANY_NAME}</span>
        </motion.div>
    </div>
  )
}
