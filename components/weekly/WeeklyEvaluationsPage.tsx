'use client'

import { FormsSection } from './forms/FormsSection'
import { MyMappingCard } from './mapping/MyMappingCard'
import { SelfReviewCard } from './self-review/SelfReviewCard'
import { TeamSelfReviewsCard } from './self-review/TeamSelfReviewsCard'
import { PulseSurveyCard } from './survey/PulseSurveyCard'
import { WeeklyInbox } from './WeeklyInbox'

export function WeeklyEvaluationsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 sm:p-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Weekly evaluations</h1>
        <p className="mt-1 text-muted-foreground">
          Each question is about one colleague. Pick the statement that best fits what you have seen; if you have not worked with them on it, say so.
        </p>
      </div>
      <MyMappingCard />
      {/* The weekly set, in the spec's order: the questions, the month's self-evaluation, then the sentiment question last. */}
      <section aria-label="This week" className="space-y-4">
        <WeeklyInbox />
        <SelfReviewCard />
        <PulseSurveyCard />
      </section>
      <TeamSelfReviewsCard />
      <FormsSection />
    </div>
  )
}
