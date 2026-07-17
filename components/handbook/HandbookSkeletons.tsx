import { Skeleton } from '@/components/ui/skeleton'

/**
 * Content-shaped, so the page has structure instantly instead of a blank
 * spinner. Both readers fetch client-side after mount; this is what the user
 * looks at while that happens, on every visit.
 */
export function HandbookHubSkeleton() {
  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto">
      <div className="rounded-card border border-border bg-card p-8 sm:p-10 mb-8">
        <Skeleton className="h-2.5 w-40" />
        <Skeleton className="mt-4 h-9 w-80 max-w-full" />
        <Skeleton className="mt-3 h-4 w-96 max-w-full" />
        <Skeleton className="mt-6 h-11 w-full max-w-md rounded-button" />
      </div>

      {[0, 1].map((section) => (
        <div key={section} className="mb-10">
          <Skeleton className="h-2.5 w-24 mb-4" />
          <div className="rounded-card border border-border divide-y divide-border">
            {[0, 1, 2].map((row) => (
              <div key={row} className="flex items-center gap-3.5 px-4 py-3">
                <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
                <div className="w-full">
                  <Skeleton className="h-3.5 w-44" />
                  <Skeleton className="mt-1.5 h-3 w-64 max-w-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function HandbookDetailSkeleton() {
  return (
    <div className="p-6 sm:p-8 max-w-4xl mx-auto">
      <Skeleton className="h-3.5 w-28 mb-5" />
      <Skeleton className="h-8 w-72 max-w-full mb-8" />
      <div className="rounded-card border border-border bg-card p-6 sm:p-8 space-y-3">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} className={i % 3 === 2 ? 'h-4 w-2/3' : 'h-4 w-full'} />
        ))}
      </div>
    </div>
  )
}
