'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { Save } from 'lucide-react'

export default function OnboardingConfigPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    welcomeMessage: '',
    quizPassPercent: 80,
    maxQuizAttempts: 3,
  })

  const loadConfig = async () => {
    try {
      const res = await fetch('/api/onboarding/config')
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load onboarding settings')
      }
      setForm({
        welcomeMessage: data.config.welcomeMessage || '',
        quizPassPercent: data.config.quizPassPercent ?? 80,
        maxQuizAttempts: data.config.maxQuizAttempts ?? 3,
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load onboarding settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadConfig()
  }, [])

  const saveConfig = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/onboarding/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save onboarding settings')
      }
      toast.success('Settings saved')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save onboarding settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <LoadingScreen message="Loading onboarding settings..." />
  }

  return (
    <div className="p-6 sm:p-8 max-w-4xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-display font-light text-foreground tracking-tight">Onboarding Settings</h1>
        <p className="text-muted-foreground mt-1">Manage welcome copy and quiz completion thresholds.</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
      <Card>
        <CardContent className="p-6 sm:p-8 space-y-4">
          <div>
            <Label className="mb-1">Welcome Message</Label>
            <Textarea
              value={form.welcomeMessage}
              onChange={(e) => setForm({ ...form, welcomeMessage: e.target.value })}
              className="min-h-[120px]"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="mb-1">Quiz Pass %</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={form.quizPassPercent}
                onChange={(e) => setForm({ ...form, quizPassPercent: Number(e.target.value) || 80 })}
              />
            </div>
            <div>
              <Label className="mb-1">Max Quiz Attempts</Label>
              <Input
                type="number"
                min={1}
                value={form.maxQuizAttempts}
                onChange={(e) => setForm({ ...form, maxQuizAttempts: Number(e.target.value) || 3 })}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={saveConfig} disabled={saving}>
              <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Settings'}
            </Button>
          </div>
        </CardContent>
      </Card>
      </motion.div>
    </div>
  )
}
