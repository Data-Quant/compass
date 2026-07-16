'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { StatsCard } from '@/components/composed/StatsCard'
import { CoverageGrid } from '@/components/handbook/CoverageGrid'
import type { CoverageRow, CoverageSummary } from '@/lib/handbook/coverage'

const stagger = {
  container: { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } },
  item: { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } },
}

export default function AdminHandbookPage() {
  const [coverage, setCoverage] = useState<CoverageRow[]>([])
  const [summary, setSummary] = useState<CoverageSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/handbook')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          toast.error(d.error)
          return
        }
        setCoverage(d.coverage || [])
        setSummary(d.summary || null)
      })
      .catch(() => toast.error('Failed to load handbook'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingScreen />

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-display font-light tracking-tight text-foreground">
          Handbook
        </h1>
        <p className="text-muted-foreground mt-1">
          Every page, and which teams it reaches. Click a page to edit it.
        </p>
      </motion.div>

      {summary && (
        <motion.div
          variants={stagger.container}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
        >
          <motion.div variants={stagger.item}>
            <StatsCard title="Pages" value={coverage.length} />
          </motion.div>
          <motion.div variants={stagger.item}>
            <StatsCard title="Covered" value={summary.covered} suffix={`/${summary.total}`} />
          </motion.div>
          <motion.div variants={stagger.item}>
            <StatsCard title="Intentional gaps" value={summary.intentional} />
          </motion.div>
          <motion.div variants={stagger.item}>
            <StatsCard title="Needs a decision" value={summary.unreviewed} />
          </motion.div>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div className="flex flex-wrap items-center gap-4 mb-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="text-emerald-600 dark:text-emerald-400">●</span> Covered
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-muted-foreground/50">–</span> Intentional gap
          </span>
          <span className="flex items-center gap-1.5">
            <span className="text-amber-600 dark:text-amber-400">⚠</span> Needs a decision
          </span>
        </div>
        <CoverageGrid rows={coverage} />
      </motion.div>
    </div>
  )
}
