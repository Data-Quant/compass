'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { ArrowLeft } from 'lucide-react'

interface ChecklistData {
  equipmentReady: boolean
  equipmentReceived: boolean
  securityOnboarding: boolean
  addedToEmailGroups: boolean
  discordSetup: boolean
  completedAt: string | null
}

interface NewHireSummary {
  id: string
  name: string
  title: string
  department: string | null
}

export default function SecurityChecklistPage() {
  const params = useParams<{ newHireId: string }>()
  const newHireId = params?.newHireId

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newHire, setNewHire] = useState<NewHireSummary | null>(null)
  const [checklist, setChecklist] = useState<ChecklistData>({
    equipmentReady: false,
    equipmentReceived: false,
    securityOnboarding: false,
    addedToEmailGroups: false,
    discordSetup: false,
    completedAt: null,
  })

  const loadData = async () => {
    if (!newHireId) return
    try {
      const res = await fetch(`/api/onboarding/security-checklist/${newHireId}`)
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load checklist')
      }
      setNewHire(data.newHire)
      setChecklist(data.checklist)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load checklist')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [newHireId]) // eslint-disable-line react-hooks/exhaustive-deps

  const updateChecklist = async (patch: Partial<ChecklistData>) => {
    if (!newHireId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/onboarding/security-checklist/${newHireId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update checklist')
      }
      setChecklist(data.checklist)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update checklist')
    } finally {
      setSaving(false)
    }
  }

  const setField = async (field: keyof ChecklistData, value: boolean) => {
    setChecklist((prev) => ({ ...prev, [field]: value }))
    await updateChecklist({ [field]: value })
  }

  if (loading) {
    return <LoadingScreen message="Loading security checklist..." />
  }

  return (
    <div className="p-6 sm:p-8 max-w-3xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/security/onboarding" className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Back to Checklists
          </Link>
        </Button>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
      <Card>
        <CardContent className="p-6 sm:p-8">
          <div className="mb-5">
            <h1 className="text-2xl sm:text-3xl font-display font-light text-foreground tracking-tight">Security Checklist</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {newHire ? `${newHire.name} · ${newHire.title}` : 'New hire security setup'}
            </p>
          </div>

          <div className="space-y-4">
            {[
              { key: 'equipmentReady', label: 'Equipment ready for handover' },
              { key: 'equipmentReceived', label: 'Equipment received by employee' },
              { key: 'securityOnboarding', label: 'Security onboarding completed' },
              { key: 'addedToEmailGroups', label: 'Added to required email groups' },
              { key: 'discordSetup', label: 'Discord setup completed' },
            ].map((row) => {
              const key = row.key as keyof ChecklistData
              const checked = Boolean(checklist[key])
              return (
                <div key={row.key} className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5">
                  <Checkbox
                    id={row.key}
                    checked={checked}
                    disabled={saving}
                    onCheckedChange={(value) => setField(key, value === true)}
                  />
                  <Label htmlFor={row.key} className="cursor-pointer">{row.label}</Label>
                </div>
              )
            })}
          </div>

          <p className="text-xs text-muted-foreground mt-4">
            {checklist.completedAt
              ? `Checklist completed on ${new Date(checklist.completedAt).toLocaleString()}`
              : 'Checklist will mark complete once all boxes are checked.'}
          </p>
        </CardContent>
      </Card>
      </motion.div>
    </div>
  )
}
