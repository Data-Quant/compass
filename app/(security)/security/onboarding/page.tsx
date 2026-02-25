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
import { ArrowRight, Shield } from 'lucide-react'

const stagger = {
  container: { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } },
  item: { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } },
}

interface PendingChecklistItem {
  id: string
  name: string
  title: string
  department: string | null
  onboardingDate: string
  securityChecklist: {
    equipmentReady: boolean
    equipmentReceived: boolean
    securityOnboarding: boolean
    addedToEmailGroups: boolean
    discordSetup: boolean
    completedAt: string | null
  }
}

export default function SecurityOnboardingListPage() {
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState<PendingChecklistItem[]>([])

  const loadData = async () => {
    try {
      const res = await fetch('/api/onboarding/security-checklists/pending')
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch pending checklists')
      }
      setPending(data.pending || [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to fetch pending checklists')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  if (loading) {
    return <LoadingScreen message="Loading onboarding checklists..." />
  }

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-display font-light text-foreground tracking-tight">Security Onboarding</h1>
        <p className="text-muted-foreground mt-1">Track and complete onboarding security checklists.</p>
      </motion.div>

      <Card>
        <CardContent className="p-6">
          {pending.length === 0 ? (
            <EmptyState
              icon={<Shield className="h-8 w-8" />}
              title="No pending checklists"
              description="All security onboarding checklists are complete."
            />
          ) : (
            <motion.div variants={stagger.container} initial="hidden" animate="visible" className="space-y-3">
              {pending.map((item) => (
                <motion.div key={item.id} variants={stagger.item}>
                  <div className="rounded-lg border border-border border-l-4 border-l-amber-500 px-4 py-3 transition-colors hover:bg-muted/40">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-foreground">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.title}
                          {item.department ? ` · ${item.department}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 dark:text-amber-400">
                          <Shield className="h-3 w-3" /> Pending
                        </Badge>
                        <Button size="sm" asChild>
                          <Link href={`/security/onboarding/${item.id}`} className="gap-1.5">
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
