'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { ArrowLeft, Save } from 'lucide-react'

interface TeamLeadFormData {
  emailGroups: string
  discordChannels: string
  tools: string
  earlyKpis: string
  availableOnDate: string
  resources: string
  submittedAt: string | null
}

interface NewHireSummary {
  id: string
  name: string
  title: string
  department: string | null
}

export default function TeamLeadFormPage() {
  const params = useParams<{ newHireId: string }>()
  const newHireId = params?.newHireId

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newHire, setNewHire] = useState<NewHireSummary | null>(null)
  const [form, setForm] = useState<TeamLeadFormData>({
    emailGroups: '',
    discordChannels: '',
    tools: '',
    earlyKpis: '',
    availableOnDate: '',
    resources: '',
    submittedAt: null,
  })

  const loadData = async () => {
    if (!newHireId) return
    try {
      const res = await fetch(`/api/onboarding/team-lead-form/${newHireId}`)
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load team lead form')
      }
      setNewHire(data.newHire)
      setForm({
        emailGroups: data.form?.emailGroups || '',
        discordChannels: data.form?.discordChannels || '',
        tools: data.form?.tools || '',
        earlyKpis: data.form?.earlyKpis || '',
        availableOnDate: data.form?.availableOnDate || '',
        resources: data.form?.resources || '',
        submittedAt: data.form?.submittedAt || null,
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load team lead form')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [newHireId]) // eslint-disable-line react-hooks/exhaustive-deps

  const saveForm = async (submit: boolean) => {
    if (!newHireId) return
    setSaving(true)
    try {
      const res = await fetch(`/api/onboarding/team-lead-form/${newHireId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          submit,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save form')
      }
      toast.success(submit ? 'Form submitted' : 'Draft saved')
      setForm((prev) => ({
        ...prev,
        submittedAt: submit ? new Date().toISOString() : prev.submittedAt,
      }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save form')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <LoadingScreen message="Loading team lead form..." />
  }

  return (
    <div className="p-6 sm:p-8 max-w-4xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard" className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Link>
        </Button>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
      <Card>
        <CardContent className="p-6 sm:p-8 space-y-5">
          <div>
            <h1 className="text-2xl sm:text-3xl font-display font-light text-foreground tracking-tight">Team Lead Onboarding Form</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {newHire ? `${newHire.name} · ${newHire.title}` : 'New hire onboarding preparation'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="mb-1">Email Groups</Label>
              <Textarea
                value={form.emailGroups}
                onChange={(e) => setForm({ ...form, emailGroups: e.target.value })}
                placeholder="List email groups for this new hire"
              />
            </div>
            <div>
              <Label className="mb-1">Discord Channels</Label>
              <Textarea
                value={form.discordChannels}
                onChange={(e) => setForm({ ...form, discordChannels: e.target.value })}
                placeholder="List Discord channels to add"
              />
            </div>
            <div>
              <Label className="mb-1">Tools & Access</Label>
              <Textarea
                value={form.tools}
                onChange={(e) => setForm({ ...form, tools: e.target.value })}
                placeholder="Required tools and permissions"
              />
            </div>
            <div>
              <Label className="mb-1">Early KPIs</Label>
              <Textarea
                value={form.earlyKpis}
                onChange={(e) => setForm({ ...form, earlyKpis: e.target.value })}
                placeholder="Expected first-week KPIs"
              />
            </div>
            <div>
              <Label className="mb-1">Availability On Onboarding Date</Label>
              <Input
                value={form.availableOnDate}
                onChange={(e) => setForm({ ...form, availableOnDate: e.target.value })}
                placeholder="e.g. Available 9am-1pm"
              />
            </div>
            <div>
              <Label className="mb-1">Resources</Label>
              <Textarea
                value={form.resources}
                onChange={(e) => setForm({ ...form, resources: e.target.value })}
                placeholder="Guides, docs, and intro resources"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => saveForm(false)} disabled={saving}>
              <Save className="h-4 w-4" /> Save Draft
            </Button>
            <Button onClick={() => saveForm(true)} disabled={saving || !!form.submittedAt}>
              {form.submittedAt ? 'Submitted' : 'Submit Form'}
            </Button>
          </div>
        </CardContent>
      </Card>
      </motion.div>
    </div>
  )
}
