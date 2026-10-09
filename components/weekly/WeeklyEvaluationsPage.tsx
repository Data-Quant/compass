'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { EvaluationsCardView } from '@/lib/weekly/service/dashboard-card'
import { weeklyRequest } from './weekly-api'
import { FormsSection } from './forms/FormsSection'
import { MyMappingCard } from './mapping/MyMappingCard'
import { SelfReviewCard } from './self-review/SelfReviewCard'
import { TeamSelfReviewsCard } from './self-review/TeamSelfReviewsCard'
import { PulseSurveyCard } from './survey/PulseSurveyCard'
import { WeeklyInbox } from './WeeklyInbox'

export function WeeklyEvaluationsPage() {
  // While people are checking their lists, the lists are the task; once questions run, the week comes first.
  const [checkingLists, setCheckingLists] = useState(false)
  useEffect(() => {
    weeklyRequest<{ card: EvaluationsCardView | null }>('/api/weekly/card')
      .then(({ card }) => setCheckingLists(card?.state === 'CHECK_LISTS'))
      .catch(() => setCheckingLists(false))
  }, [])
  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6 sm:p-8">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}>
        <h1 className="font-display text-3xl font-bold text-foreground">Evaluations</h1>
        <p className="mt-1.5 max-w-2xl text-muted-foreground">
          A few short questions each week about the people you work with. Pick the statement that best fits what you have seen; if you have not worked with them on it, say so.
        </p>
      </motion.div>
      {checkingLists && <MyMappingCard />}
      {/* The weekly set, in the spec's order: the questions, the month's self-evaluation, then the sentiment question last. */}
      <section aria-label="This week" className="space-y-6">
        <WeeklyInbox />
        <SelfReviewCard />
        <PulseSurveyCard />
      </section>
      <TeamSelfReviewsCard />
      {!checkingLists && <MyMappingCard />}
      <FormsSection />
    </div>
  )
}
