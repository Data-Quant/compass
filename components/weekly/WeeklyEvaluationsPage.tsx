'use client'

import { FormsSection } from './forms/FormsSection'
import { LeadQuestionsCard } from './mapping/LeadQuestionsCard'
import { MyMappingCard } from './mapping/MyMappingCard'
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
      <LeadQuestionsCard />
      <FormsSection />
      <WeeklyInbox />
      <PulseSurveyCard />
    </div>
  )
}
