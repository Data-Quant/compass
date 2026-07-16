'use client'

import Link from 'next/link'
import * as Icons from 'lucide-react'
import { MagicCard } from '@/components/magicui/magic-card'

type Props = {
  slug: string
  title: string
  icon: string
  linkLabel: string | null
  /** Carried through so an HR preview survives navigation into a page. */
  previewTeam?: string | null
}

export function HandbookTile({ slug, title, icon, linkLabel, previewTeam }: Props) {
  // Icon names come from a controlled seed, but fall back rather than crash.
  const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[icon] ?? Icons.FileText
  const href = previewTeam
    ? `/handbook/${slug}?previewTeam=${encodeURIComponent(previewTeam)}`
    : `/handbook/${slug}`

  return (
    <Link href={href} className="block h-full">
      <MagicCard className="h-full flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-primary shrink-0" />
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
        </div>
        {linkLabel && <p className="text-xs text-muted-foreground">{linkLabel} →</p>}
      </MagicCard>
    </Link>
  )
}
