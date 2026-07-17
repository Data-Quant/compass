'use client'

import Link from 'next/link'
import * as Icons from 'lucide-react'
import { MagicCard } from '@/components/magicui/magic-card'
import { BorderBeam } from '@/components/magicui/border-beam'

type Props = {
  slug: string
  title: string
  icon: string
  linkLabel: string | null
  description: string | null
  /** Carried through so an HR preview survives navigation into a page. */
  previewTeam?: string | null
  /** Traces the border once on mount, to land the eye on the first read. */
  beam?: boolean
}

export function HandbookTile({
  slug,
  title,
  icon,
  linkLabel,
  description,
  previewTeam,
  beam = false,
}: Props) {
  // Icon names come from a controlled seed, but fall back rather than crash.
  const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[icon] ?? Icons.FileText
  const href = previewTeam
    ? `/handbook/${slug}?previewTeam=${encodeURIComponent(previewTeam)}`
    : `/handbook/${slug}`

  return (
    <Link href={href} className="block h-full">
      <MagicCard className="relative h-full flex flex-col gap-2">
        {beam && <BorderBeam size={180} duration={6} borderWidth={1.5} loop={false} />}
        <div className="flex items-center gap-2">
          <Icon className="h-5 w-5 text-primary shrink-0" />
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
        </div>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
        {linkLabel && <p className="text-xs text-muted-foreground">{linkLabel} →</p>}
      </MagicCard>
    </Link>
  )
}
