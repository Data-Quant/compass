'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { GlareCard } from '@/components/ui/glare-card'
import { cn } from '@/lib/utils'

interface DataCardProps {
  title?: string
  children: React.ReactNode
  className?: string
  headerAction?: React.ReactNode
}

export function DataCard({
  title,
  children,
  className,
  headerAction,
}: DataCardProps) {
  return (
    <GlareCard className="rounded-card">
      <Card
        className={cn(
          'rounded-card border-border bg-card',
          'transition-all duration-300 hover:-translate-y-1 hover:shadow-glow',
          className
        )}
      >
        {title && (
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            {headerAction}
          </CardHeader>
        )}
        <CardContent className={title ? '' : 'pt-6'}>{children}</CardContent>
      </Card>
    </GlareCard>
  )
}
