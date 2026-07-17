'use client'

import Link from 'next/link'
import * as Icons from 'lucide-react'
import { ChevronRight } from 'lucide-react'

export function HandbookRow({
  slug,
  title,
  icon,
  description,
  previewTeam,
}: {
  slug: string
  title: string
  icon: string
  description: string | null
  previewTeam?: string | null
}) {
  // Icon names come from a controlled seed, but fall back rather than crash.
  const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[icon] ?? Icons.FileText
  const href = previewTeam
    ? `/handbook/${slug}?previewTeam=${encodeURIComponent(previewTeam)}`
    : `/handbook/${slug}`

  return (
    <Link
      href={href}
      className="flex items-center gap-3.5 px-4 py-3 transition-colors hover:bg-muted/50"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-4 w-4 text-primary" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        {description && (
          <span className="block text-xs text-muted-foreground truncate">{description}</span>
        )}
      </span>
      <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground/50" />
    </Link>
  )
}
