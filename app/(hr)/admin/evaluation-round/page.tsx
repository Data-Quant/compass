import { notFound } from 'next/navigation'
import { EvaluationRoundPage } from '@/components/weekly/round/EvaluationRoundPage'
import { isWeeklyEnabled } from '@/lib/weekly/flag'

export const dynamic = 'force-dynamic'

export default function EvaluationRoundRoute() {
  if (!isWeeklyEnabled()) notFound()
  return <EvaluationRoundPage />
}
