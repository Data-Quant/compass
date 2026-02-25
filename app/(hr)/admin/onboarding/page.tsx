'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { StatsCard } from '@/components/composed/StatsCard'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { Briefcase, UserPlus, ArrowRight } from 'lucide-react'

interface PositionRow {
  id: string
  status: 'OPEN' | 'CLOSED' | 'CANCELLED'
}

interface NewHireRow {
  id: string
  status: 'PENDING' | 'ONBOARDING' | 'COMPLETED'
}

export default function OnboardingAdminDashboardPage() {
  const [loading, setLoading] = useState(true)
  const [positions, setPositions] = useState<PositionRow[]>([])
  const [newHires, setNewHires] = useState<NewHireRow[]>([])

  const loadData = async () => {
    try {
      const [positionsRes, hiresRes] = await Promise.all([
        fetch('/api/onboarding/positions'),
        fetch('/api/onboarding/new-hires'),
      ])
      const [positionsData, hiresData] = await Promise.all([positionsRes.json(), hiresRes.json()])
      if (!positionsRes.ok) throw new Error(positionsData.error || 'Failed to load positions')
      if (!hiresRes.ok) throw new Error(hiresData.error || 'Failed to load new hires')

      setPositions(positionsData.positions || [])
      setNewHires(hiresData.newHires || [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load onboarding dashboard')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const openPositions = useMemo(() => positions.filter((p) => p.status === 'OPEN').length, [positions])
  const closedPositions = useMemo(() => positions.filter((p) => p.status === 'CLOSED').length, [positions])
  const pendingHires = useMemo(() => newHires.filter((h) => h.status === 'PENDING').length, [newHires])
  const onboardingHires = useMemo(() => newHires.filter((h) => h.status === 'ONBOARDING').length, [newHires])

  if (loading) {
    return <LoadingScreen message="Loading onboarding dashboard..." />
  }

  return (
    <div className="p-6 sm:p-8 max-w-6xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-display font-light text-foreground tracking-tight">Onboarding Dashboard</h1>
        <p className="text-muted-foreground mt-1">Manage hiring pipeline, provisioning, and onboarding content.</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
      >
        <StatsCard title="Open Positions" value={openPositions} icon={<Briefcase className="w-4 h-4" />} />
        <StatsCard title="Closed Positions" value={closedPositions} icon={<Briefcase className="w-4 h-4" />} />
        <StatsCard title="Pending New Hires" value={pendingHires} icon={<UserPlus className="w-4 h-4" />} />
        <StatsCard title="Onboarding Active" value={onboardingHires} icon={<UserPlus className="w-4 h-4" />} />
      </motion.div>

      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Button asChild variant="outline">
              <Link href="/admin/onboarding/positions" className="gap-1.5">
                Positions <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/onboarding/new-hires" className="gap-1.5">
                New Hires <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/onboarding/modules" className="gap-1.5">
                Modules <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/onboarding/quiz" className="gap-1.5">
                Quiz <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
