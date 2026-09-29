import { notFound } from 'next/navigation'
import { WeeklyEvaluationsPage } from '@/components/weekly/WeeklyEvaluationsPage'
import { isWeeklyEnabled } from '@/lib/weekly/flag'

export const dynamic = 'force-dynamic'

export default function WeeklyEvaluationsRoute() {
  if (!isWeeklyEnabled()) notFound()
  return <WeeklyEvaluationsPage />
}
