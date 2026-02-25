'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { useLayoutUser } from '@/components/layout/SidebarLayout'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { ArrowRight, CheckCircle2, Lock, PlayCircle } from 'lucide-react'
import { OnboardingProgressTracker } from './_components/OnboardingProgressTracker'

type ModuleStatus = 'LOCKED' | 'IN_PROGRESS' | 'COMPLETED'

interface ModuleRow {
  id: string
  slug: string
  title: string
  orderIndex: number
  content: string
  isActive: boolean
  status: ModuleStatus
}

interface ConfigRow {
  welcomeMessage: string
  quizPassPercent: number
  maxQuizAttempts: number
}

export default function OnboardingHubPage() {
  const user = useLayoutUser()
  const [modules, setModules] = useState<ModuleRow[]>([])
  const [config, setConfig] = useState<ConfigRow | null>(null)
  const [loading, setLoading] = useState(true)

  const loadData = async () => {
    try {
      const [modulesRes, configRes] = await Promise.all([
        fetch('/api/onboarding/modules'),
        fetch('/api/onboarding/config'),
      ])
      const [modulesData, configData] = await Promise.all([modulesRes.json(), configRes.json()])
      if (!modulesRes.ok) throw new Error(modulesData.error || 'Failed to load modules')
      if (!configRes.ok) throw new Error(configData.error || 'Failed to load config')
      setModules(modulesData.modules || [])
      setConfig(configData.config || null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load onboarding data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const totalModules = modules.length
  const completedModules = useMemo(
    () => modules.filter((module) => module.status === 'COMPLETED').length,
    [modules]
  )
  const allModulesCompleted = totalModules > 0 && completedModules === totalModules

  if (loading) {
    return <LoadingScreen message="Loading onboarding..." />
  }

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-display font-light text-foreground tracking-tight">
          Onboarding
        </h1>
        <p className="text-muted-foreground mt-1">
          {config?.welcomeMessage || 'Welcome to your onboarding journey in Compass.'}
        </p>
      </motion.div>

      <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-6 items-start">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <OnboardingProgressTracker
            modules={modules.map((module) => ({
              id: module.id,
              slug: module.slug,
              title: module.title,
              orderIndex: module.orderIndex,
              status: module.status,
            }))}
            reviewActive
          />
        </motion.div>

        <div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {modules.map((module, index) => {
              const status = module.status
              const locked = status === 'LOCKED'
              const completed = status === 'COMPLETED'

              return (
                <motion.div
                  key={module.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.03 * index }}
                >
                  <Card className={`${locked ? 'opacity-80' : ''} ${completed ? 'border-l-4 border-l-emerald-500' : locked ? 'border-l-4 border-l-slate-400' : 'border-l-4 border-l-blue-500'}`}>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs uppercase tracking-wide text-muted-foreground">Module {module.orderIndex}</p>
                          <h2 className="text-base font-semibold text-foreground">{module.title}</h2>
                        </div>
                        <Badge
                          variant="secondary"
                          className={
                            completed
                              ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                              : locked
                                ? 'bg-slate-500/10 text-slate-600 dark:text-slate-400'
                                : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                          }
                        >
                          {completed ? 'Completed' : locked ? 'Locked' : 'In Progress'}
                        </Badge>
                      </div>

                      <div className="mt-4">
                        {locked ? (
                          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                            <Lock className="h-4 w-4" /> Unlock previous module first
                          </div>
                        ) : (
                          <Button asChild size="sm" variant={completed ? 'outline' : 'default'}>
                            <Link href={`/onboarding/${module.slug}`} className="gap-1.5">
                              {completed ? <CheckCircle2 className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
                              {completed ? 'Review' : 'Open Module'}
                            </Link>
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )
            })}
          </div>

          <div className="mt-8 flex justify-end">
            {allModulesCompleted ? (
              <Button asChild>
                <Link href="/onboarding/quiz" className="gap-1.5">
                  Take Quiz <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <Button disabled>
                Take Quiz <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>

          {user?.onboardingCompleted === false && !allModulesCompleted && (
            <p className="mt-3 text-sm text-muted-foreground text-right">
              Complete all modules to unlock the quiz.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
