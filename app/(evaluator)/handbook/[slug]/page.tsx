'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowLeft, FileQuestion } from 'lucide-react'
import * as Icons from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { EmptyState } from '@/components/composed/EmptyState'
import { ShimmerButton } from '@/components/magicui/shimmer-button'
import { HandbookMarkdown } from '@/components/handbook/HandbookMarkdown'

type Detail = {
  slug: string
  title: string
  icon: string
  category: string
  linkHref: string | null
  linkLabel: string | null
  bodyMarkdown: string
}

export default function HandbookDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = use(params)
  const router = useRouter()
  const [detail, setDetail] = useState<Detail | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    fetch(`/api/handbook/${slug}`)
      .then(async (r) => {
        if (!r.ok) {
          if (!cancelled) setNotFound(true)
          return null
        }
        return r.json()
      })
      .then((d) => {
        if (d && !cancelled) setDetail(d)
      })
      .catch(() => {
        if (!cancelled) setNotFound(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [slug])

  if (loading) return <LoadingScreen />

  if (notFound || !detail) {
    return (
      <div className="p-6 sm:p-8 max-w-4xl mx-auto">
        <EmptyState
          icon={<FileQuestion className="h-10 w-10" />}
          title="Not available for your team"
          description="This section either doesn't exist or isn't part of your team's handbook."
          action={
            <Link
              href="/handbook"
              className="text-sm text-primary underline underline-offset-2"
            >
              Back to the Handbook
            </Link>
          }
        />
      </div>
    )
  }

  const Icon =
    (Icons as unknown as Record<string, Icons.LucideIcon>)[detail.icon] ?? Icons.FileText

  return (
    <div className="p-6 sm:p-8 max-w-4xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <Link
          href="/handbook"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          The Handbook
        </Link>
        <h1 className="text-2xl sm:text-3xl font-display font-light tracking-tight text-foreground flex items-center gap-3">
          <Icon className="h-7 w-7 text-primary shrink-0" />
          {detail.title}
        </h1>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        <Card>
          <CardContent className="p-6 sm:p-8">
            <HandbookMarkdown source={detail.bodyMarkdown} />

            {detail.linkHref && detail.linkLabel && (
              <div className="mt-8 pt-6 border-t border-border">
                <ShimmerButton onClick={() => router.push(detail.linkHref as string)}>
                  {detail.linkLabel}
                </ShimmerButton>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
