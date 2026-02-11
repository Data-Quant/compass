'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { PageHeader } from '@/components/layout/page-header'
import { PageContainer, PageContent } from '@/components/layout/page-container'
import {
    Monitor,
    Search,
    Wrench,
    CheckCircle2,
    Clock,
    Filter,
    User,
    Plus,
} from 'lucide-react'

interface DeviceTicket {
    id: string
    title: string
    description: string
    deviceType: string
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
    status: 'OPEN' | 'UNDER_REVIEW' | 'SOLUTION' | 'RESOLVED'
    solution: string | null
    hrNotes: string | null
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
    LOW: { label: 'Low', color: 'text-slate-600 dark:text-slate-400', bg: 'bg-slate-100 dark:bg-slate-500/20' },
    MEDIUM: { label: 'Medium', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-500/20' },
    HIGH: { label: 'High', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-500/20' },
    URGENT: { label: 'Urgent', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-500/20' },
}

const STATUS_CONFIG = {
    OPEN: { label: 'Open', color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-500/20', icon: Plus },
    UNDER_REVIEW: { label: 'Under Review', color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-500/20', icon: Search },
    SOLUTION: { label: 'Solution', color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-100 dark:bg-purple-500/20', icon: Wrench },
    RESOLVED: { label: 'Resolved', color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-500/20', icon: CheckCircle2 },
}

const STATUS_FLOW: Record<string, string> = {
    OPEN: 'UNDER_REVIEW',
    UNDER_REVIEW: 'SOLUTION',
    SOLUTION: 'RESOLVED',
}

export default function HRDeviceTicketsPage() {
    const router = useRouter()
    const [tickets, setTickets] = useState<DeviceTicket[]>([])
    const [allTickets, setAllTickets] = useState<DeviceTicket[]>([])
    const [loading, setLoading] = useState(true)
    const [statusFilter, setStatusFilter] = useState<string>('ALL')
    const [priorityFilter, setPriorityFilter] = useState<string>('ALL')

    // Update modal state
    const [updateModal, setUpdateModal] = useState<{ open: boolean; ticket: DeviceTicket | null }>({ open: false, ticket: null })
    const [newStatus, setNewStatus] = useState('')
    const [solution, setSolution] = useState('')
    const [hrNotes, setHrNotes] = useState('')
    const [processing, setProcessing] = useState(false)

    useEffect(() => {
        fetch('/api/auth/session')
            .then((res) => res.json())
            .then((data) => {
                if (!data.user || data.user.role !== 'HR') {
                    router.push('/login')
                    return
                }
                loadTickets()
            })
            .catch(() => router.push('/login'))
    }, [])

    const loadTickets = async () => {
        try {
            const params = new URLSearchParams()
            if (statusFilter !== 'ALL') params.set('status', statusFilter)
            if (priorityFilter !== 'ALL') params.set('priority', priorityFilter)

            const filteredQuery = params.toString()
            const filteredUrl = filteredQuery ? `/api/device-tickets?${filteredQuery}` : '/api/device-tickets'

            const [filteredResponse, allResponse] = await Promise.all([
                fetch(filteredUrl),
                fetch('/api/device-tickets'),
            ])

            const [filteredData, allData] = await Promise.all([
                filteredResponse.json(),
                allResponse.json(),
            ])

            if (!filteredResponse.ok) {
                throw new Error(filteredData.error || 'Failed to load filtered tickets')
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
        setHrNotes(ticket.hrNotes || '')
    }

    const handleUpdate = async () => {
        if (!updateModal.ticket) return

        const normalizedSolution = solution.trim()
        if ((newStatus === 'SOLUTION' || newStatus === 'RESOLVED') && !normalizedSolution) {
            toast.error('Solution / Response is required for Solution or Resolved status')
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
                    hrNotes: hrNotes.trim() || undefined,
                }),
            })

            const data = await res.json()

            if (data.success) {
                toast.success(`Ticket updated to ${STATUS_CONFIG[newStatus as keyof typeof STATUS_CONFIG]?.label || newStatus}`)
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

    // Stats
    const statCounts = {
        total: allTickets.length,
        open: allTickets.filter(t => t.status === 'OPEN').length,
        underReview: allTickets.filter(t => t.status === 'UNDER_REVIEW').length,
        solution: allTickets.filter(t => t.status === 'SOLUTION').length,
        resolved: allTickets.filter(t => t.status === 'RESOLVED').length,
    }

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex flex-col items-center gap-4"
                >
                    <div className="w-12 h-12 rounded-full gradient-primary animate-pulse" />
                    <p className="text-muted text-sm">Loading device tickets...</p>
                </motion.div>
            </div>
        )
    }

    return (
        <PageContainer>
            <PageHeader backHref="/admin" badge="Device Support" />
            <PageContent>
                {/* Stats Row */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6"
                >
                    {[
                        { label: 'Total', count: statCounts.total, color: 'text-foreground', bg: 'bg-surface' },
                        { label: 'Open', count: statCounts.open, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-500/10' },
                        { label: 'Under Review', count: statCounts.underReview, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-500/10' },
                        { label: 'Solution', count: statCounts.solution, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-500/10' },
                        { label: 'Resolved', count: statCounts.resolved, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-500/10' },
                    ].map((stat) => (
                        <div key={stat.label} className={`${stat.bg} rounded-xl p-4 border border-border`}>
                            <div className={`text-2xl font-bold ${stat.color}`}>{stat.count}</div>
                            <div className="text-xs text-muted mt-0.5">{stat.label}</div>
                        </div>
                    ))}
                </motion.div>

                {/* Filters */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="flex flex-wrap gap-3 mb-6"
                >
                    <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-muted" />
                        <span className="text-sm text-muted">Filters:</span>
                    </div>
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="px-3 py-1.5 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        <option value="ALL">All Statuses</option>
                        <option value="OPEN">Open</option>
                        <option value="UNDER_REVIEW">Under Review</option>
                        <option value="SOLUTION">Solution</option>
                        <option value="RESOLVED">Resolved</option>
                    </select>
                    <select
                        value={priorityFilter}
                        onChange={(e) => setPriorityFilter(e.target.value)}
                        className="px-3 py-1.5 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        <option value="ALL">All Priorities</option>
                        <option value="URGENT">Urgent</option>
                        <option value="HIGH">High</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="LOW">Low</option>
                    </select>
                </motion.div>

                {/* Tickets Table */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="glass rounded-2xl border border-border overflow-hidden"
                >
                    {tickets.length === 0 ? (
                        <div className="p-8 text-center">
                            <div className="w-14 h-14 rounded-2xl bg-surface mx-auto mb-3 flex items-center justify-center">
                                <Monitor className="w-7 h-7 text-muted" />
                            </div>
                            <h3 className="font-semibold text-foreground mb-1">No tickets found</h3>
                            <p className="text-sm text-muted">
                                {statusFilter !== 'ALL' || priorityFilter !== 'ALL'
                                    ? 'Try adjusting your filters'
                                    : 'No device support tickets have been submitted yet'}
                            </p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-border bg-surface/50">
                                        <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Employee</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Ticket</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Device</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Priority</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Status</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Date</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {tickets.map((ticket, index) => {
                                        const statusConfig = STATUS_CONFIG[ticket.status]
                                        const priorityConfig = PRIORITY_CONFIG[ticket.priority]
                                        const StatusIcon = statusConfig.icon
                                        const canAdvance = ticket.status !== 'RESOLVED'

                                        return (
                                            <motion.tr
                                                key={ticket.id}
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                transition={{ delay: 0.3 + index * 0.02 }}
                                                className="hover:bg-surface/50 transition-colors"
                                            >
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-medium">
                                                            {ticket.employee.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                                        </div>
                                                        <div>
                                                            <div className="text-sm font-medium text-foreground">{ticket.employee.name}</div>
                                                            <div className="text-xs text-muted">{ticket.employee.department || '—'}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="max-w-[200px]">
                                                        <div className="text-sm font-medium text-foreground truncate">{ticket.title}</div>
                                                        <div className="text-xs text-muted truncate">{ticket.description}</div>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <span className="text-sm text-foreground">{ticket.deviceType}</span>
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${priorityConfig.bg} ${priorityConfig.color}`}>
                                                        {priorityConfig.label}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium ${statusConfig.bg} ${statusConfig.color}`}>
                                                        <StatusIcon className="w-3 h-3" />
                                                        {statusConfig.label}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-xs text-muted">
                                                    {new Date(ticket.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap">
                                                    {canAdvance ? (
                                                        <button
                                                            onClick={() => openUpdateModal(ticket)}
                                                            className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                                                        >
                                                            Update
                                                        </button>
                                                    ) : (
                                                        <span className="text-xs text-green-600 dark:text-green-400 font-medium">Done</span>
                                                    )}
                                                </td>
                                            </motion.tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </motion.div>
            </PageContent>

            {/* Update Ticket Modal */}
            <Modal
                isOpen={updateModal.open}
                onClose={() => setUpdateModal({ open: false, ticket: null })}
                title="Update Device Support Ticket"
                size="md"
            >
                {updateModal.ticket && (
                    <div className="space-y-4">
                        {/* Ticket Info */}
                        <div className="p-3 bg-surface rounded-lg">
                            <div className="flex items-center gap-2 mb-1">
                                <User className="w-4 h-4 text-muted" />
                                <span className="font-medium text-foreground text-sm">{updateModal.ticket.employee.name}</span>
                            </div>
                            <p className="font-medium text-foreground">{updateModal.ticket.title}</p>
                            <p className="text-sm text-muted mt-1">{updateModal.ticket.description}</p>
                            <div className="flex items-center gap-3 mt-2 text-xs text-muted">
                                <span>{updateModal.ticket.deviceType}</span>
                                <span>•</span>
                                <span className={PRIORITY_CONFIG[updateModal.ticket.priority].color}>
                                    {PRIORITY_CONFIG[updateModal.ticket.priority].label} Priority
                                </span>
                            </div>
                        </div>

                        {/* Status Change */}
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1.5">New Status</label>
                            <select
                                value={newStatus}
                                onChange={(e) => setNewStatus(e.target.value)}
                                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="OPEN">Open</option>
                                <option value="UNDER_REVIEW">Under Review</option>
                                <option value="SOLUTION">Solution Provided</option>
                                <option value="RESOLVED">Resolved</option>
                            </select>
                        </div>

                        {/* Solution */}
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1.5">
                                Solution / Response {(newStatus === 'SOLUTION' || newStatus === 'RESOLVED') && <span className="text-red-500">*</span>}
                            </label>
                            <textarea
                                value={solution}
                                onChange={(e) => setSolution(e.target.value)}
                                rows={3}
                                placeholder="Describe the solution or steps taken..."
                                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                            />
                        </div>

                        {/* HR Notes (internal) */}
                        <div>
                            <label className="block text-sm font-medium text-foreground mb-1.5">
                                Internal Notes <span className="text-xs text-muted">(not visible to employee)</span>
                            </label>
                            <textarea
                                value={hrNotes}
                                onChange={(e) => setHrNotes(e.target.value)}
                                rows={2}
                                placeholder="Internal notes for HR team..."
                                className="w-full px-3 py-2 bg-surface border border-border rounded-lg text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                            />
                        </div>

                        {/* Actions */}
                        <div className="flex justify-end gap-3 pt-2">
                            <button
                                onClick={() => setUpdateModal({ open: false, ticket: null })}
                                className="px-4 py-2 border border-border rounded-lg text-foreground hover:bg-surface transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleUpdate}
                                disabled={processing}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                            >
                                {processing ? 'Updating...' : 'Update Ticket'}
                            </button>
                        </div>
                    </div>
                )}
            </Modal>
        </PageContainer>
    )
}
