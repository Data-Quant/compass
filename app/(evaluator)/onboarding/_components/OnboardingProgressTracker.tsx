'use client'

import Link from 'next/link'
import { CheckCircle2, ChevronRight, ClipboardCheck, Circle, Lock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

export type TrackerModuleStatus = 'LOCKED' | 'IN_PROGRESS' | 'COMPLETED'

export interface TrackerModuleItem {
  id: string
  slug: string
  title: string
  orderIndex: number
  status: TrackerModuleStatus
}

interface OnboardingProgressTrackerProps {
  modules: TrackerModuleItem[]
  currentSlug?: string | null
  reviewActive?: boolean
  reviewHref?: string
  className?: string
}

export function OnboardingProgressTracker({
  modules,
  currentSlug,
  reviewActive = false,
  reviewHref = '/onboarding',
  className,
}: OnboardingProgressTrackerProps) {
  const orderedModules = [...modules].sort((a, b) => a.orderIndex - b.orderIndex)
  const totalModules = orderedModules.length
  const completedModules = orderedModules.filter((module) => module.status === 'COMPLETED').length
  const progressValue = totalModules > 0 ? Math.round((completedModules / totalModules) * 100) : 0

  return (
    <Card className={className}>
      <CardContent className="p-0">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-semibold text-foreground">Training Progress</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Complete your compliance training modules
          </p>
        </div>

        <div className="border-b border-border px-5 py-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Progress
            </p>
            <p className="text-sm font-semibold text-foreground">
              {completedModules}/{totalModules}
            </p>
          </div>
          <Progress value={progressValue} className="mt-2 h-2 [&>div]:bg-foreground" />
          <p className="mt-2 text-xs text-muted-foreground">{progressValue}% completed</p>
        </div>

        <div className="p-2">
          {orderedModules.map((module) => {
            const completed = module.status === 'COMPLETED'
            const locked = module.status === 'LOCKED'
            const active = currentSlug === module.slug

            const rowClassName = cn(
              'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
              active ? 'bg-muted font-medium text-foreground' : '',
              !locked && !active ? 'text-foreground hover:bg-muted/60' : '',
              locked ? 'cursor-not-allowed text-muted-foreground/70' : ''
            )

            const icon = completed ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : locked ? (
              <Lock className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground" />
            )

            if (locked) {
              return (
                <div key={module.id} className={rowClassName} aria-disabled="true">
                  {icon}
                  <span className="flex-1 truncate">{module.title}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/70" />
                </div>
              )
            }

            return (
              <Link key={module.id} href={`/onboarding/${module.slug}`} className={rowClassName}>
                {icon}
                <span className="flex-1 truncate">{module.title}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            )
          })}

          <Link
            href={reviewHref}
            className={cn(
              'mt-1 flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
              reviewActive
                ? 'bg-muted font-medium text-foreground'
                : 'text-foreground hover:bg-muted/60'
            )}
          >
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1 truncate">Review & Submit</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
