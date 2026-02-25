'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { Save } from 'lucide-react'

const stagger = {
  container: { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } },
  item: { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } },
}

interface ModuleRow {
  id: string
  slug: string
  title: string
  orderIndex: number
  content: string
  isActive: boolean
}

export default function OnboardingModulesPage() {
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [modules, setModules] = useState<ModuleRow[]>([])

  const loadModules = async () => {
    try {
      const res = await fetch('/api/onboarding/modules?includeInactive=true')
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load modules')
      }
      setModules(
        (data.modules || []).map((row: any) => ({
          id: row.id,
          slug: row.slug,
          title: row.title,
          orderIndex: row.orderIndex,
          content: row.content || '',
          isActive: row.isActive,
        }))
      )
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load modules')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadModules()
  }, [])

  const updateModule = (id: string, patch: Partial<ModuleRow>) => {
    setModules((prev) => prev.map((module) => (module.id === id ? { ...module, ...patch } : module)))
  }

  const saveModule = async (module: ModuleRow) => {
    setSavingId(module.id)
    try {
      const res = await fetch(`/api/onboarding/modules/${module.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: module.title,
          content: module.content,
          orderIndex: module.orderIndex,
          isActive: module.isActive,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save module')
      }
      toast.success('Module saved')
      await loadModules()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save module')
    } finally {
      setSavingId(null)
    }
  }

  if (loading) {
    return <LoadingScreen message="Loading modules..." />
  }

  return (
    <div className="p-6 sm:p-8 max-w-6xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-display font-light text-foreground tracking-tight">Onboarding Modules</h1>
        <p className="text-muted-foreground mt-1">Edit module content shown to new hires in onboarding.</p>
      </motion.div>

      <motion.div variants={stagger.container} initial="hidden" animate="visible" className="space-y-4">
        {modules.map((module) => (
          <motion.div key={module.id} variants={stagger.item}>
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <Label className="mb-1">Title</Label>
                  <Input
                    value={module.title}
                    onChange={(e) => updateModule(module.id, { title: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="mb-1">Order</Label>
                  <Input
                    type="number"
                    min={1}
                    value={module.orderIndex}
                    onChange={(e) => updateModule(module.id, { orderIndex: Number(e.target.value) || 1 })}
                  />
                </div>
              </div>

              <div>
                <Label className="mb-1">Content</Label>
                <Textarea
                  value={module.content}
                  onChange={(e) => updateModule(module.id, { content: e.target.value })}
                  className="min-h-[140px]"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={module.isActive}
                    onCheckedChange={(checked) => updateModule(module.id, { isActive: checked })}
                  />
                  <span className="text-sm text-muted-foreground">Active</span>
                </div>
                <Button onClick={() => saveModule(module)} disabled={savingId === module.id}>
                  <Save className="w-4 h-4" /> {savingId === module.id ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </CardContent>
          </Card>
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}
