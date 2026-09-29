import { Card, CardContent } from '@/components/ui/card'
import { formatKarachiDate } from '@/lib/kpi/format'
import type { MonthView } from '@/lib/kpi/view-types'

export function DeadlineBanner({ month }: { month: MonthView }) {
  return (
    <Card>
      <CardContent className="flex flex-wrap gap-x-6 gap-y-1 p-4 text-sm">
        <span>
          {month.locked ? 'KPIs locked' : 'KPIs lock'} <strong>{formatKarachiDate(month.goalsLockAt)}</strong>
        </span>
        <span>Claims due <strong>{formatKarachiDate(month.claimsDueAt)}</strong></span>
        <span>Verification due <strong>{formatKarachiDate(month.verifyDueAt)}</strong></span>
        <span>Month final <strong>{formatKarachiDate(month.targetFinalAt)}</strong></span>
      </CardContent>
    </Card>
  )
}
