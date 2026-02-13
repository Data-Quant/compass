'use client'

import { MagicCard } from '@/components/magicui/magic-card'
import { NumberTicker } from '@/components/magicui/number-ticker'
import { cn } from '@/lib/utils'

interface StatsCardProps {
  title: string
  value: number
  suffix?: string
  prefix?: string
  icon?: React.ReactNode
  description?: string
  className?: string
  decimalPlaces?: number
}

export function StatsCard({
  title,
  value,
  suffix,
  prefix,
  icon,
  description,
  className,
  decimalPlaces = 0,
}: StatsCardProps) {
  return (
    <MagicCard className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {title}
        </p>
        {icon && <div className="text-primary">{icon}</div>}
      </div>
      <div className="flex items-baseline gap-1">
        {prefix && (
          <span className="text-3xl font-light tracking-tight text-foreground">
            {prefix}
          </span>
        )}
        <NumberTicker
          value={value}
          className="text-3xl font-light tracking-tight text-foreground"
          decimalPlaces={decimalPlaces}
        />
        {suffix && (
          <span className="text-sm font-medium text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </MagicCard>
  )
}
