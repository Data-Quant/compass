'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import {
    LogOut,
    Monitor,
    Plus,
    ArrowLeft,
    AlertTriangle,
    Clock,
    Search,
    Wrench,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
} from 'lucide-react'
import { PLATFORM_NAME, COMPANY_NAME, LOGO } from '@/lib/config'

interface DeviceTicket {
    id: string
    title: string
    description: string
    deviceType: string
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
    status: 'OPEN' | 'UNDER_REVIEW' | 'SOLUTION' | 'RESOLVED'
    solution: string | null
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
    const router = useRouter()
    const [user, setUser] = useState<any>(null)
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
        fetch('/api/auth/session')
            .then((res) => res.json())
            .then((data) => {
                if (!data.user) {
                    router.push('/login')
                    return
                }
                setUser(data.user)
                loadTickets()
            })
            .catch(() => router.push('/login'))
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

    const handleLogout = async () => {
        await fetch('/api/auth/logout', { method: 'POST' })
        router.push('/login')
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
                    <p className="text-muted text-sm">Loading device support...</p>
                </motion.div>
            </div>
        )
    }

    const activeTickets = tickets.filter(t => t.status !== 'RESOLVED')
    const resolvedTickets = tickets.filter(t => t.status === 'RESOLVED')

    return (
        <div className="min-h-screen bg-[var(--background)]">
            {/* Navigation */}
            <nav className="sticky top-0 z-50 glass border-b border-border">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between h-16">
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex items-center gap-3"
                        >
                            <span className="inline-flex h-8 w-8 items-center justify-center">
                                <img src={LOGO.company} alt={COMPANY_NAME} className="h-8 w-8 dark:hidden" />
                                <img src={LOGO.companyDark} alt={COMPANY_NAME} className="hidden h-8 w-8 dark:block" />
                            </span>
                            <div className="h-6 w-px bg-border hidden sm:block" />
                            <div className="hidden sm:flex items-center">
                                <span className="text-lg font-semibold text-foreground">{PLATFORM_NAME}</span>
                            </div>
                        </motion.div>

                        <div className="flex items-center gap-3">
                            <span className="text-sm text-muted hidden sm:block">
                                {user?.name}
                            </span>
                            <Link
                                href="/dashboard"
                                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface hover:bg-surface-hover text-foreground text-sm font-medium transition-colors"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                <span className="hidden sm:inline">Dashboard</span>
                            </Link>
                            <ThemeToggle />
                            <button
                                onClick={handleLogout}
                                className="p-2 text-muted hover:text-foreground transition-colors"
                            >
                                <LogOut className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>
            </nav>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Header */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 gap-4"
                >
                    <div>
                        <h1 className="text-3xl font-bold text-foreground mb-2 flex items-center gap-3">
                            <Monitor className="w-8 h-8 text-indigo-500" />
                            Device Support
                        </h1>
                        <p className="text-muted">Report device issues and track your support tickets</p>
                    </div>
                    <button
                        onClick={() => setShowForm(!showForm)}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl gradient-primary text-white font-medium hover:opacity-90 transition-all"
                    >
                        <Plus className="w-4 h-4" />
                        New Ticket
                    </button>
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
                            <div className="glass rounded-2xl p-6 border border-border">
                                <h2 className="text-lg font-semibold text-foreground mb-4">Submit a Support Ticket</h2>
                                <form onSubmit={handleSubmit} className="space-y-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-foreground mb-1.5">
                                                Issue Title <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={title}
                                                onChange={(e) => setTitle(e.target.value)}
                                                placeholder="e.g. Laptop screen flickering"
                                                className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-foreground mb-1.5">
                                                Device Type <span className="text-red-500">*</span>
                                            </label>
                                            <select
                                                value={deviceType}
                                                onChange={(e) => setDeviceType(e.target.value)}
                                                className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                                                required
                                            >
                                                <option value="">Select device type...</option>
                                                {DEVICE_TYPES.map((type) => (
                                                    <option key={type} value={type}>{type}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-foreground mb-1.5">
                                            Description <span className="text-red-500">*</span>
                                        </label>
                                        <textarea
                                            value={description}
                                            onChange={(e) => setDescription(e.target.value)}
                                            rows={4}
                                            placeholder="Describe the issue in detail. When does it happen? What have you tried?"
                                            className="w-full px-4 py-2.5 bg-surface border border-border rounded-xl text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none"
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-foreground mb-1.5">Priority</label>
                                        <div className="flex gap-2 flex-wrap">
                                            {Object.entries(PRIORITY_CONFIG).map(([key, config]) => (
                                                <button
                                                    key={key}
                                                    type="button"
                                                    onClick={() => setPriority(key)}
                                                    className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${priority === key
                                                        ? `${config.bg} ${config.color} border-current`
                                                        : 'bg-surface border-border text-muted hover:bg-surface-hover'
                                                        }`}
                                                >
                                                    {config.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="flex justify-end gap-3 pt-2">
                                        <button
                                            type="button"
                                            onClick={() => setShowForm(false)}
                                            className="px-5 py-2.5 rounded-xl border border-border text-foreground hover:bg-surface-hover transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={submitting}
                                            className="px-5 py-2.5 rounded-xl gradient-primary text-white font-medium hover:opacity-90 disabled:opacity-50 transition-all"
                                        >
                                            {submitting ? 'Submitting...' : 'Submit Ticket'}
                                        </button>
                                    </div>
                                </form>
                            </div>
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
                    <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                        <Clock className="w-5 h-5 text-amber-500" />
                        Active Tickets
                        {activeTickets.length > 0 && (
                            <span className="px-2 py-0.5 text-xs bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-full">
                                {activeTickets.length}
                            </span>
                        )}
                    </h2>

                    {activeTickets.length === 0 ? (
                        <div className="glass rounded-2xl p-8 border border-border text-center">
                            <div className="w-14 h-14 rounded-2xl bg-surface mx-auto mb-3 flex items-center justify-center">
                                <CheckCircle2 className="w-7 h-7 text-muted" />
                            </div>
                            <h3 className="font-semibold text-foreground mb-1">No active tickets</h3>
                            <p className="text-sm text-muted">All caught up! Create a new ticket if you need device support.</p>
                        </div>
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
                                        className="glass rounded-xl border border-border overflow-hidden"
                                    >
                                        <button
                                            onClick={() => setExpandedTicket(isExpanded ? null : ticket.id)}
                                            className="w-full p-4 flex items-center gap-4 text-left hover:bg-surface/50 transition-colors"
                                        >
                                            <div className={`w-10 h-10 rounded-xl ${statusConfig.bg} flex items-center justify-center flex-shrink-0`}>
                                                <StatusIcon className={`w-5 h-5 ${statusConfig.color}`} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-medium text-foreground truncate">{ticket.title}</h4>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-xs text-muted">{ticket.deviceType}</span>
                                                    <span className="text-border">•</span>
                                                    <span className={`text-xs ${priorityConfig.color}`}>{priorityConfig.label}</span>
                                                    <span className="text-border">•</span>
                                                    <span className="text-xs text-muted">
                                                        {new Date(ticket.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                                    </span>
                                                </div>
                                            </div>
                                            <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${statusConfig.bg} ${statusConfig.color}`}>
                                                {statusConfig.label}
                                            </span>
                                            {isExpanded ? (
                                                <ChevronUp className="w-4 h-4 text-muted flex-shrink-0" />
                                            ) : (
                                                <ChevronDown className="w-4 h-4 text-muted flex-shrink-0" />
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
                                                                <p className="text-xs font-medium text-muted mb-1">Description</p>
                                                                <p className="text-sm text-foreground whitespace-pre-wrap">{ticket.description}</p>
                                                            </div>
                                                            {ticket.hrAssignedTo && (
                                                                <div>
                                                                    <p className="text-xs font-medium text-muted mb-1">Assigned to</p>
                                                                    <p className="text-sm text-foreground">{ticket.hrAssignedTo}</p>
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
                        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                            <CheckCircle2 className="w-5 h-5 text-green-500" />
                            Resolved
                            <span className="px-2 py-0.5 text-xs bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400 rounded-full">
                                {resolvedTickets.length}
                            </span>
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
                                        className="glass rounded-xl border border-border overflow-hidden opacity-75 hover:opacity-100 transition-opacity"
                                    >
                                        <button
                                            onClick={() => setExpandedTicket(isExpanded ? null : ticket.id)}
                                            className="w-full p-4 flex items-center gap-4 text-left hover:bg-surface/50 transition-colors"
                                        >
                                            <div className="w-10 h-10 rounded-xl bg-green-100 dark:bg-green-500/20 flex items-center justify-center flex-shrink-0">
                                                <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="font-medium text-foreground truncate">{ticket.title}</h4>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-xs text-muted">{ticket.deviceType}</span>
                                                    <span className="text-border">•</span>
                                                    <span className={`text-xs ${priorityConfig.color}`}>{priorityConfig.label}</span>
                                                    <span className="text-border">•</span>
                                                    <span className="text-xs text-muted">
                                                        Resolved {ticket.resolvedAt ? new Date(ticket.resolvedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                                                    </span>
                                                </div>
                                            </div>
                                            {isExpanded ? (
                                                <ChevronUp className="w-4 h-4 text-muted flex-shrink-0" />
                                            ) : (
                                                <ChevronDown className="w-4 h-4 text-muted flex-shrink-0" />
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
                                                                <p className="text-xs font-medium text-muted mb-1">Description</p>
                                                                <p className="text-sm text-foreground whitespace-pre-wrap">{ticket.description}</p>
                                                            </div>
                                                            {ticket.solution && (
                                                                <div className="p-3 bg-green-50 dark:bg-green-500/10 rounded-lg">
                                                                    <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-1">Solution</p>
                                                                    <p className="text-sm text-green-800 dark:text-green-300 whitespace-pre-wrap">{ticket.solution}</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
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
                    className="mt-16 flex items-center justify-center gap-2 text-xs text-muted/50"
                >
                    <span>Powered by {COMPANY_NAME}</span>
                </motion.div>
            </main>
        </div>
    )
}
