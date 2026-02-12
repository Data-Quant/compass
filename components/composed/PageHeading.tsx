'use client'

import { cn } from '@/lib/utils'

interface PageHeadingProps {
  title: string
  subtitle?: string
  className?: string
  children?: React.ReactNode
}

export function PageHeading({
  title,
  subtitle,
  className,
  children,
}: PageHeadingProps) {
  return (
    <div className={cn('mb-8', className)}>
      <h1 className="text-3xl font-display font-light tracking-tight text-foreground mb-2">
        {title}
      </h1>
      {subtitle && (
        <p className="text-muted-foreground">{subtitle}</p>
      )}
      {children}
    </div>
  )
}
