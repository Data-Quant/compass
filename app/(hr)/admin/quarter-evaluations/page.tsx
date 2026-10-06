import { notFound } from 'next/navigation'
import { QuarterEvaluationsWorkspace } from '@/components/weekly/form-tables/QuarterEvaluationsWorkspace'
import { isWeeklyEnabled } from '@/lib/weekly/flag'

export const dynamic = 'force-dynamic'

export default function QuarterEvaluationsPage() {
  if (!isWeeklyEnabled()) notFound()
  return <QuarterEvaluationsWorkspace />
}
