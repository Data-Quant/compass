import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

function CardSkeleton({ height }: { height: string }) {
  return (
    <Card className="p-5">
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-2 h-3 w-full max-w-md" />
      <Skeleton className={`mt-5 w-full ${height}`} />
    </Card>
  )
}

function TileSkeletons() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[0, 1, 2, 3].map((tile) => (
        <Card key={tile} className="p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-7 w-16" />
          <Skeleton className="mt-2 h-3 w-36" />
        </Card>
      ))}
    </div>
  )
}

/** Shaped like the active section, so nothing jumps when data lands. */
export function SectionSkeleton({ section }: { section: 'overview' | 'people' }) {
  if (section === 'people') {
    return (
      <div aria-busy="true" aria-label="Loading analytics" className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {[0, 1, 2, 3].map((chip) => <Skeleton key={chip} className="h-8 w-32 rounded-full" />)}
        </div>
        <TileSkeletons />
        <CardSkeleton height="h-[120px]" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <CardSkeleton height="h-[160px]" />
          <CardSkeleton height="h-[160px]" />
        </div>
      </div>
    )
  }
  return (
    <div aria-busy="true" aria-label="Loading analytics" className="flex flex-col gap-4">
      <TileSkeletons />
      <CardSkeleton height="h-[240px]" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CardSkeleton height="h-[200px]" />
        <CardSkeleton height="h-[200px]" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((donut) => <CardSkeleton key={donut} height="h-[160px]" />)}
      </div>
    </div>
  )
}

export function PageSkeleton({ section }: { section: 'overview' | 'people' }) {
  return (
    <div className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8">
      <div className="mb-6 flex flex-col gap-2">
        <Skeleton className="h-3.5 w-56" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-3 rounded-full" />
          <Skeleton className="h-8 w-72 max-w-[70%]" />
        </div>
        <Skeleton className="h-3.5 w-80 max-w-full" />
      </div>
      <Skeleton className="mb-5 h-9 w-48" />
      <SectionSkeleton section={section} />
    </div>
  )
}

export function WorkspaceSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading analytics" className="flex flex-col gap-4">
      <TileSkeletons />
      <CardSkeleton height="h-[220px]" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CardSkeleton height="h-[220px]" />
        <CardSkeleton height="h-[220px]" />
      </div>
    </div>
  )
}
