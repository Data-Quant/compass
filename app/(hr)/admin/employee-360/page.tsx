import { Suspense } from 'react'
import { Employee360Cockpit } from '@/components/analytics/Employee360Cockpit'

function CockpitFallback() {
  return (
    <div className="flex min-h-full items-center justify-center bg-background p-8">
      <div className="flex items-center gap-3 text-sm text-muted-foreground" role="status">
        <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
        Initializing employee intelligence…
      </div>
    </div>
  )
}

export default function Employee360Page() {
  return (
    <Suspense fallback={<CockpitFallback />}>
      <Employee360Cockpit />
    </Suspense>
  )
}
