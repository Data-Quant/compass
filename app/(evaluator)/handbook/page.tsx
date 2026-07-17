'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { AlertCircle, BookOpen } from 'lucide-react'
import { EmptyState } from '@/components/composed/EmptyState'
import { HandbookTile } from '@/components/handbook/HandbookTile'
import { HandbookHero } from '@/components/handbook/HandbookHero'
import { HandbookRow } from '@/components/handbook/HandbookRow'
import { HandbookHubSkeleton } from '@/components/handbook/HandbookSkeletons'
import { useLayoutUser } from '@/components/layout/SidebarLayout'
import { ALL_TEAMS, TEAM_LABELS } from '@/lib/handbook/teams'
import { filterPages } from '@/lib/handbook/search'
import type { HubPage } from '@/lib/handbook/audience'
import { isAdminRole } from '@/lib/permissions'
import { cn } from '@/lib/utils'

const stagger = {
  container: { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } },
  item: { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } },
}

// Rows stagger faster than cards -- a long list must not crawl.
const rowStagger = {
  container: { hidden: {}, visible: { transition: { staggerChildren: 0.04 } } },
  item: { hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } },
}

const CATEGORY_LABELS: Record<string, string> = {
  START_HERE: 'Start here',
  THE_COMPANY: 'The company',
  POLICIES: 'Policies',
  BENEFITS_AND_REWARDS: 'Benefits & rewards',
  PERFORMANCE: 'Performance',
  HOW_TO: 'How-to',
}

const CATEGORY_ORDER = [
  'START_HERE',
  'THE_COMPANY',
  'POLICIES',
  'BENEFITS_AND_REWARDS',
  'PERFORMANCE',
  'HOW_TO',
]

function HandbookHubInner() {
  const user = useLayoutUser()
  const searchParams = useSearchParams()
  const previewTeam = searchParams.get('previewTeam')
  const [pages, setPages] = useState<HubPage[]>([])
  const [untagged, setUntagged] = useState(false)
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    const qs = previewTeam ? `?previewTeam=${encodeURIComponent(previewTeam)}` : ''
    fetch(`/api/handbook${qs}`)
      .then((r) => r.json())
      .then((d) => {
        setPages(d.pages || [])
        setUntagged(Boolean(d.untagged))
      })
      .catch(() => setPages([]))
      .finally(() => setLoading(false))
  }, [previewTeam])

  const visible = useMemo(() => filterPages(pages, query), [pages, query])

  if (loading) return <HandbookHubSkeleton />

  // The server decides what the preview shows; this label only reflects it.
  const previewLabel =
    previewTeam && previewTeam !== 'UNTAGGED'
      ? TEAM_LABELS[previewTeam as keyof typeof TEAM_LABELS]
      : null
  const teamLabel =
    previewLabel ?? (user?.teamTag ? TEAM_LABELS[user.teamTag as keyof typeof TEAM_LABELS] : null)
  const firstName = user?.name?.split(' ')[0] ?? null

  const featured = visible.filter((p) => p.category === 'START_HERE')
  const rest = CATEGORY_ORDER.filter((c) => c !== 'START_HERE')

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto">
      {user && isAdminRole(user.role) && (
        <div className="flex flex-wrap items-center gap-2 mb-6 rounded-lg border border-border bg-muted/40 px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground mr-1">Preview as</span>
          <Link
            href="/handbook"
            className={cn(
              'rounded-badge border px-2.5 py-0.5 text-xs transition-colors',
              !previewTeam
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted'
            )}
          >
            Me
          </Link>
          <Link
            href="/handbook?previewTeam=UNTAGGED"
            className={cn(
              'rounded-badge border px-2.5 py-0.5 text-xs transition-colors',
              previewTeam === 'UNTAGGED'
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:bg-muted'
            )}
          >
            Untagged
          </Link>
          {ALL_TEAMS.map((team) => (
            <Link
              key={team}
              href={`/handbook?previewTeam=${team}`}
              className={cn(
                'rounded-badge border px-2.5 py-0.5 text-xs transition-colors',
                previewTeam === team
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:bg-muted'
              )}
            >
              {TEAM_LABELS[team]}
            </Link>
          ))}
        </div>
      )}

      <HandbookHero
        firstName={firstName}
        teamLabel={teamLabel}
        query={query}
        onQueryChange={setQuery}
      />

      {untagged && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 mb-8"
        >
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="text-sm font-medium text-foreground">Your team hasn&apos;t been set yet</p>
            <p className="text-sm text-muted-foreground">
              Some sections are hidden until it is. Contact HR to get set up.
            </p>
          </div>
        </motion.div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-10 w-10" />}
          title={query ? 'Nothing matches that' : 'Nothing here yet'}
          description={
            query
              ? 'Try a different word, or clear the search to see everything.'
              : 'No handbook content has been published for your team.'
          }
        />
      ) : (
        <>
          {featured.length > 0 && (
            <div className="mb-10">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-4">
                {CATEGORY_LABELS.START_HERE}
              </p>
              <motion.div
                variants={stagger.container}
                initial="hidden"
                animate="visible"
                className="grid grid-cols-1 sm:grid-cols-2 gap-4"
              >
                {featured.map((p) => (
                  <motion.div key={p.slug} variants={stagger.item}>
                    <HandbookTile
                      slug={p.slug}
                      title={p.title}
                      icon={p.icon}
                      linkLabel={p.linkLabel}
                      description={p.description}
                      previewTeam={previewTeam}
                      beam={p.slug === featured[0].slug}
                    />
                  </motion.div>
                ))}
              </motion.div>
            </div>
          )}

          {rest
            .filter((c) => visible.some((p) => p.category === c))
            .map((category) => (
              <div key={category} className="mb-10">
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-4">
                  {CATEGORY_LABELS[category]}
                </p>
                <motion.div
                  variants={rowStagger.container}
                  initial="hidden"
                  animate="visible"
                  className="rounded-card border border-border divide-y divide-border overflow-hidden"
                >
                  {visible
                    .filter((p) => p.category === category)
                    .map((p) => (
                      <motion.div key={p.slug} variants={rowStagger.item}>
                        <HandbookRow
                          slug={p.slug}
                          title={p.title}
                          icon={p.icon}
                          description={p.description}
                          previewTeam={previewTeam}
                        />
                      </motion.div>
                    ))}
                </motion.div>
              </div>
            ))}
        </>
      )}
    </div>
  )
}

// useSearchParams requires a Suspense boundary in the App Router.
export default function HandbookHubPage() {
  return (
    <Suspense fallback={<HandbookHubSkeleton />}>
      <HandbookHubInner />
    </Suspense>
  )
}
