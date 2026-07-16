'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertCircle, BookOpen } from 'lucide-react'
import { BackgroundBeams } from '@/components/aceternity/background-beams'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { EmptyState } from '@/components/composed/EmptyState'
import { HandbookTile } from '@/components/handbook/HandbookTile'
import { useLayoutUser } from '@/components/layout/SidebarLayout'
import { TEAM_LABELS } from '@/lib/handbook/teams'

const stagger = {
  container: { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } },
  item: { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } },
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

type HubPage = {
  slug: string
  title: string
  icon: string
  category: string
  orderIndex: number
  linkHref: string | null
  linkLabel: string | null
}

export default function HandbookHubPage() {
  const user = useLayoutUser()
  const [pages, setPages] = useState<HubPage[]>([])
  const [untagged, setUntagged] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/handbook')
      .then((r) => r.json())
      .then((d) => {
        setPages(d.pages || [])
        setUntagged(Boolean(d.untagged))
      })
      .catch(() => setPages([]))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingScreen />

  const teamLabel = user?.teamTag
    ? TEAM_LABELS[user.teamTag as keyof typeof TEAM_LABELS]
    : null

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-card border border-border bg-card p-8 mb-8"
      >
        <BackgroundBeams className="opacity-40 dark:opacity-20" />
        <div className="relative">
          {teamLabel && (
            <div className="inline-flex items-center gap-1.5 border border-border rounded-badge px-2.5 py-1 mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              <span className="text-xs font-medium text-muted-foreground">{teamLabel}</span>
            </div>
          )}
          <h1 className="text-2xl sm:text-3xl font-display font-light tracking-tight text-foreground">
            The <span className="gradient-text">Handbook</span>
          </h1>
          <p className="text-muted-foreground mt-1">
            Policies, benefits, and how we work together.
          </p>
        </div>
      </motion.div>

      {untagged && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 mb-8"
        >
          <AlertCircle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="text-sm font-medium text-foreground">
              Your team hasn&apos;t been set yet
            </p>
            <p className="text-sm text-muted-foreground">
              Some sections are hidden until it is. Contact HR to get set up.
            </p>
          </div>
        </motion.div>
      )}

      {pages.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-10 w-10" />}
          title="Nothing here yet"
          description="No handbook content has been published for your team."
        />
      ) : (
        CATEGORY_ORDER.filter((c) => pages.some((p) => p.category === c)).map((category) => (
          <div key={category} className="mb-10">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-4">
              {CATEGORY_LABELS[category]}
            </p>
            <motion.div
              variants={stagger.container}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {pages
                .filter((p) => p.category === category)
                .map((p) => (
                  <motion.div key={p.slug} variants={stagger.item}>
                    <HandbookTile
                      slug={p.slug}
                      title={p.title}
                      icon={p.icon}
                      linkLabel={p.linkLabel}
                    />
                  </motion.div>
                ))}
            </motion.div>
          </div>
        ))
      )}
    </div>
  )
}
