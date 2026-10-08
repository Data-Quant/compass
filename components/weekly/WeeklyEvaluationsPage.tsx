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
          Each question asks for one real, recent example: the situation, what the person did, and what happened. Only what you describe counts, so be specific.
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
