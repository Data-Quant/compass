'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, CalendarCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { WeeklyMeResponse } from '@/lib/weekly/view-types'
import { weeklyRequest } from './weekly-api'

/** Renders nothing unless the module is on and questions are waiting. */
export function WeeklyQuestionsCard() {
  const [me, setMe] = useState<WeeklyMeResponse | null>(null)
  useEffect(() => {
    weeklyRequest<WeeklyMeResponse>('/api/weekly/me').then(setMe).catch(() => setMe(null))
  }, [])
  if (!me?.enabled || !me.cycleActive || !me.openCount) return null
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
      <Card className="border-emerald-500/20">
        <CardContent className="flex flex-col gap-4 p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-emerald-500/10 p-2.5">
              <CalendarCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-foreground">This week’s evaluation questions</p>
                <Badge variant="secondary">{me.openCount}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">About five minutes each: describe a real situation, what the person did, and what happened.</p>
            </div>
          </div>
          <Button asChild>
            <Link href="/evaluations/weekly" className="gap-1.5">Answer now <ArrowRight className="h-3.5 w-3.5" /></Link>
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  )
}
