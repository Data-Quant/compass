'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { EmptyState } from '@/components/composed/EmptyState'
import { ArrowRight, UserPlus } from 'lucide-react'

const stagger = {
  container: { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } },
  item: { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } },
}

const STATUS_BORDER: Record<string, string> = {
  PENDING: 'border-l-4 border-l-amber-500',
  ONBOARDING: 'border-l-4 border-l-blue-500',
  COMPLETED: 'border-l-4 border-l-emerald-500',
}

interface NewHireRow {
  id: string
  name: string
  title: string
  email: string
  department: string | null
  onboardingDate: string
  status: 'PENDING' | 'ONBOARDING' | 'COMPLETED'
  teamLead?: { name: string } | null
  user?: { id: string; onboardingCompleted: boolean } | null
}

export default function NewHiresPage() {
  const [loading, setLoading] = useState(true)
  const [newHires, setNewHires] = useState<NewHireRow[]>([])

  const loadData = async () => {
    try {
      const res = await fetch('/api/onboarding/new-hires')
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load new hires')
      }
      setNewHires(data.newHires || [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load new hires')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  if (loading) {
    return <LoadingScreen message="Loading new hires..." />
  }

  return (
    <div className="p-6 sm:p-8 max-w-6xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-display font-light text-foreground tracking-tight">New Hires</h1>
        <p className="text-muted-foreground mt-1">Track each new hire record and onboarding readiness.</p>
      </motion.div>

      <Card>
        <CardContent className="p-4">
          {newHires.length === 0 ? (
            <EmptyState
              icon={<UserPlus className="h-8 w-8" />}
              title="No new hire records"
              description="New hires will appear here once created from closed positions."
            />
          ) : (
            <motion.div variants={stagger.container} initial="hidden" animate="visible" className="space-y-3">
              {newHires.map((newHire) => (
                <motion.div key={newHire.id} variants={stagger.item}>
                  <div className={`rounded-lg border border-border px-4 py-3 transition-colors hover:bg-muted/40 ${STATUS_BORDER[newHire.status] || ''}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{newHire.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {newHire.title}
                          {newHire.department ? ` · ${newHire.department}` : ''}
                          {newHire.teamLead?.name ? ` · Lead: ${newHire.teamLead.name}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="secondary"
                          className={
                            newHire.status === 'PENDING'
                              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                              : newHire.status === 'ONBOARDING'
                                ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          }
                        >
                          {newHire.status}
                        </Badge>
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/admin/onboarding/new-hires/${newHire.id}`} className="gap-1.5">
                            Open <ArrowRight className="h-4 w-4" />
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
