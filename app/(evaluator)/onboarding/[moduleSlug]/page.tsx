'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react'
import { OnboardingProgressTracker, type TrackerModuleItem } from '../_components/OnboardingProgressTracker'

interface ModulePayload {
  id: string
  slug: string
  title: string
  orderIndex: number
  content: string
}

interface ProgressPayload {
  status: 'LOCKED' | 'IN_PROGRESS' | 'COMPLETED'
}

export default function OnboardingModulePage() {
  const params = useParams<{ moduleSlug: string }>()
  const router = useRouter()
  const moduleSlug = params?.moduleSlug

  const [moduleData, setModuleData] = useState<ModulePayload | null>(null)
  const [modules, setModules] = useState<TrackerModuleItem[]>([])
  const [progress, setProgress] = useState<ProgressPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [markingComplete, setMarkingComplete] = useState(false)

  const loadModule = async () => {
    if (!moduleSlug) return
    try {
      const [moduleRes, modulesRes] = await Promise.all([
        fetch(`/api/onboarding/modules/${moduleSlug}`),
        fetch('/api/onboarding/modules'),
      ])
      const [modulePayload, modulesPayload] = await Promise.all([moduleRes.json(), modulesRes.json()])
      if (!moduleRes.ok) {
        throw new Error(modulePayload.error || 'Failed to load module')
      }
      if (!modulesRes.ok) {
        throw new Error(modulesPayload.error || 'Failed to load module progress')
      }
      setModuleData(modulePayload.module)
      setProgress(modulePayload.progress)
      const normalizedModules: TrackerModuleItem[] = Array.isArray(modulesPayload.modules)
        ? modulesPayload.modules
            .filter(
              (
                module: unknown
              ): module is {
                id: string
                slug: string
                title: string
                orderIndex: number
                status: 'LOCKED' | 'IN_PROGRESS' | 'COMPLETED'
              } =>
                typeof module === 'object' &&
                module !== null &&
                typeof (module as { id?: unknown }).id === 'string' &&
                typeof (module as { slug?: unknown }).slug === 'string' &&
                typeof (module as { title?: unknown }).title === 'string' &&
                typeof (module as { orderIndex?: unknown }).orderIndex === 'number' &&
                ((module as { status?: unknown }).status === 'LOCKED' ||
                  (module as { status?: unknown }).status === 'IN_PROGRESS' ||
                  (module as { status?: unknown }).status === 'COMPLETED')
            )
            .map((module: {
              id: string
              slug: string
              title: string
              orderIndex: number
              status: 'LOCKED' | 'IN_PROGRESS' | 'COMPLETED'
            }) => ({
              id: module.id,
              slug: module.slug,
              title: module.title,
              orderIndex: module.orderIndex,
              status: module.status,
            }))
        : []
      setModules(normalizedModules)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load module')
      router.push('/onboarding')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadModule()
  }, [moduleSlug]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleMarkComplete = async () => {
    if (!moduleData) return
    setMarkingComplete(true)
    try {
      const res = await fetch('/api/onboarding/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moduleSlug: moduleData.slug }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to mark module as complete')
      }
      toast.success('Module completed')
      const nextSlug = data.nextModule?.slug
      if (nextSlug) {
        router.push(`/onboarding/${nextSlug}`)
      } else {
        router.push('/onboarding')
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to mark module complete')
    } finally {
      setMarkingComplete(false)
    }
  }

  if (loading) {
    return <LoadingScreen message="Loading module..." />
  }

  if (!moduleData) {
    return null
  }

  const status = progress?.status || 'LOCKED'

  return (
    <div className="p-6 sm:p-8 max-w-6xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/onboarding" className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Back to Onboarding
          </Link>
        </Button>
      </motion.div>

      <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-6 items-start">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <OnboardingProgressTracker modules={modules} currentSlug={moduleData.slug} />
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card>
          <CardContent className="p-6 sm:p-8">
            <div className="flex items-center justify-between gap-3 mb-5">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Module {moduleData.orderIndex}
                </p>
                <h1 className="text-2xl sm:text-3xl font-display font-light text-foreground tracking-tight">
                  {moduleData.title}
                </h1>
              </div>
              <Badge
                variant="secondary"
                className={
                  status === 'COMPLETED'
                    ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : status === 'IN_PROGRESS'
                      ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                      : 'bg-slate-500/10 text-slate-600 dark:text-slate-400'
                }
              >
                {status === 'COMPLETED' ? 'Completed' : status === 'IN_PROGRESS' ? 'In Progress' : 'Locked'}
              </Badge>
            </div>

            <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap">
              {moduleData.content?.trim() || 'Content will be updated by HR soon.'}
            </div>

            <div className="mt-8 flex justify-end">
              {status === 'IN_PROGRESS' ? (
                <Button onClick={handleMarkComplete} disabled={markingComplete} className="gap-1.5">
                  {markingComplete ? 'Saving...' : 'Mark as Complete'}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : status === 'COMPLETED' ? (
                <Button variant="outline" asChild className="gap-1.5">
                  <Link href="/onboarding">
                    <CheckCircle2 className="h-4 w-4" /> Completed
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" disabled>
                  Module Locked
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
        </motion.div>
      </div>
    </div>
  )
}
