'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { RelationshipType, RELATIONSHIP_TYPE_LABELS } from '@/types'
import { PageHeader } from '@/components/layout/page-header'
import { PageFooter } from '@/components/layout/page-footer'
import { PageContainer, PageContent } from '@/components/layout/page-container'
import { Sliders, Save, Upload, Trash2, Info, Users, ChevronDown, ChevronUp } from 'lucide-react'

interface WeightProfile {
  id: string
  categorySetKey: string
  displayName: string
  weights: Record<string, number>
  employeeCount: number
}

const ALL_TYPES: RelationshipType[] = ['TEAM_LEAD', 'DIRECT_REPORT', 'PEER', 'HR', 'C_LEVEL', 'DEPT']
const TYPE_SHORT_LABELS: Record<string, string> = {
  TEAM_LEAD: 'Lead',
  DIRECT_REPORT: 'Direct Reports',
  PEER: 'Peer',
  HR: 'HR',
  C_LEVEL: 'Hamiz',
  DEPT: 'Dept',
}

export default function SettingsPage() {
  const router = useRouter()
  const [profiles, setProfiles] = useState<WeightProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [expandedProfile, setExpandedProfile] = useState<string | null>(null)
  const [editWeights, setEditWeights] = useState<Record<string, number>>({})

  useEffect(() => {
    fetch('/api/auth/session')
      .then((res) => res.json())
      .then((data) => {
        if (!data.user || data.user.role !== 'HR') {
          router.push('/login')
          return
        }
        loadProfiles()
      })
      .catch(() => router.push('/login'))
  }, [])

  const loadProfiles = async () => {
    try {
      const response = await fetch('/api/admin/weight-profiles')
      const data = await response.json()
      setProfiles(data.profiles || [])
    } catch {
      toast.error('Failed to load weight profiles')
    } finally {
      setLoading(false)
    }
  }

  const handleSeedProfiles = async () => {
    setSeeding(true)
    try {
      const response = await fetch('/api/admin/import-compiled', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'seed-profiles' }),
      })
      const data = await response.json()
      if (data.success) {
        toast.success(data.message)
        loadProfiles()
      } else {
        toast.error(data.error || 'Failed to seed profiles')
      }
    } catch {
      toast.error('Failed to seed weight profiles')
    } finally {
      setSeeding(false)
    }
  }

  const handleExpand = (profile: WeightProfile) => {
    if (expandedProfile === profile.id) {
      setExpandedProfile(null)
    } else {
      setExpandedProfile(profile.id)
      setEditWeights({ ...profile.weights })
    }
  }

  const handleWeightChange = (type: string, value: number) => {
    setEditWeights(prev => ({
      ...prev,
      [type]: Math.max(0, Math.min(100, value)) / 100,
    }))
  }

  const getEditTotal = () => {
    return Object.values(editWeights).reduce((sum, w) => sum + w, 0) * 100
  }

  const handleSaveProfile = async (profile: WeightProfile) => {
    const total = getEditTotal()
    if (Math.abs(total - 100) > 1) {
      toast.error(`Weights must sum to 100%. Current: ${total.toFixed(1)}%`)
      return
    }

    setSaving(true)
    try {
      const types = profile.categorySetKey.split(',')
      const response = await fetch('/api/admin/weight-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryTypes: types,
          weights: editWeights,
          displayName: profile.displayName,
        }),
      })
      const data = await response.json()
      if (data.success) {
        toast.success('Profile saved!')
        setExpandedProfile(null)
        loadProfiles()
      } else {
        toast.error(data.error || 'Save failed')
      }
    } catch {
      toast.error('Failed to save profile')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteProfile = async (id: string) => {
    if (!confirm('Delete this weight profile?')) return
    try {
      const response = await fetch(`/api/admin/weight-profiles?id=${id}`, { method: 'DELETE' })
      const data = await response.json()
      if (data.success) {
        toast.success('Profile deleted')
        loadProfiles()
      } else {
        toast.error(data.error || 'Delete failed')
      }
    } catch {
      toast.error('Failed to delete profile')
    }
  }

  if (loading) {
    return (
      <PageContainer>
        <div className="min-h-screen flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-4"
          >
            <div className="w-12 h-12 rounded-full gradient-primary animate-pulse" />
            <p className="text-muted text-sm">Loading settings...</p>
          </motion.div>
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader backHref="/admin" backLabel="Back to Admin" badge="Settings" />

      <PageContent className="max-w-6xl">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Weight Profiles</h1>
            <p className="text-muted mt-1">
              Each employee&apos;s weight profile is determined by their set of evaluator categories.
              Employees with the same evaluator types share the same weights.
            </p>
          </div>
          <button
            onClick={handleSeedProfiles}
            disabled={seeding}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors text-sm font-medium"
          >
            <Upload className="w-4 h-4" />
            {seeding ? 'Seeding...' : 'Seed Q4 2025 Profiles'}
          </button>
        </div>

        {profiles.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-xl p-12 text-center"
          >
            <Sliders className="w-12 h-12 text-muted/30 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">No Weight Profiles</h3>
            <p className="text-muted mb-6">
              Click &quot;Seed Q4 2025 Profiles&quot; to import the 10 weight profiles from the compiled spreadsheet.
            </p>
          </motion.div>
        ) : (
          <>
            {/* Weight Profile Table */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-xl overflow-hidden mb-6"
            >
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface/50 border-b border-border">
                      <th className="text-left px-4 py-3 font-semibold text-foreground">Category Set</th>
                      {ALL_TYPES.map(type => (
                        <th key={type} className="text-center px-3 py-3 font-semibold text-foreground whitespace-nowrap">
                          {TYPE_SHORT_LABELS[type]}
                        </th>
                      ))}
                      <th className="text-center px-3 py-3 font-semibold text-foreground">Total</th>
                      <th className="text-center px-3 py-3 font-semibold text-foreground">
                        <Users className="w-4 h-4 inline" />
                      </th>
                      <th className="text-center px-3 py-3 font-semibold text-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profiles.map((profile, idx) => {
                      const total = Object.values(profile.weights).reduce((s, w) => s + w, 0) * 100
                      const isExpanded = expandedProfile === profile.id

                      return (
                        <motion.tr
                          key={profile.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: idx * 0.03 }}
                          className="border-b border-border/50 hover:bg-surface/30 transition-colors"
                        >
                          {isExpanded ? (
                            <td colSpan={ALL_TYPES.length + 4} className="px-4 py-4">
                              <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                  <span className="font-medium text-foreground">{profile.displayName}</span>
                                  <button
                                    onClick={() => setExpandedProfile(null)}
                                    className="text-muted hover:text-foreground"
                                  >
                                    <ChevronUp className="w-4 h-4" />
                                  </button>
                                </div>

                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                                  {ALL_TYPES.map(type => {
                                    const isInSet = profile.categorySetKey.includes(type)
                                    return (
                                      <div key={type} className="space-y-1">
                                        <label className="text-xs font-medium text-muted">
                                          {TYPE_SHORT_LABELS[type]}
                                        </label>
                                        <div className="flex items-center gap-1">
                                          <input
                                            type="number"
                                            min="0"
                                            max="100"
                                            step="1"
                                            disabled={!isInSet}
                                            value={isInSet ? ((editWeights[type] || 0) * 100).toFixed(0) : ''}
                                            onChange={(e) => handleWeightChange(type, parseFloat(e.target.value) || 0)}
                                            className="w-full px-2 py-1.5 bg-surface border border-border rounded-lg text-foreground text-center text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 disabled:opacity-30 disabled:cursor-not-allowed"
                                          />
                                          <span className="text-xs text-muted">%</span>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>

                                <div className="flex items-center justify-between pt-2">
                                  <span className={`text-sm font-medium ${
                                    Math.abs(getEditTotal() - 100) < 1 
                                      ? 'text-emerald-600 dark:text-emerald-400' 
                                      : 'text-red-600 dark:text-red-400'
                                  }`}>
                                    Total: {getEditTotal().toFixed(1)}%
                                  </span>
                                  <button
                                    onClick={() => handleSaveProfile(profile)}
                                    disabled={saving || Math.abs(getEditTotal() - 100) > 1}
                                    className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                                  >
                                    <Save className="w-3.5 h-3.5" />
                                    {saving ? 'Saving...' : 'Save'}
                                  </button>
                                </div>
                              </div>
                            </td>
                          ) : (
                            <>
                              <td className="px-4 py-3 text-foreground font-medium max-w-[280px]">
                                <span className="truncate block" title={profile.displayName}>
                                  {profile.displayName}
                                </span>
                              </td>
                              {ALL_TYPES.map(type => {
                                const w = (profile.weights[type] || 0) as number
                                return (
                                  <td key={type} className="text-center px-3 py-3">
                                    {w > 0 ? (
                                      <span className="inline-block min-w-[48px] px-2 py-0.5 rounded-md bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-medium text-xs">
                                        {(w * 100).toFixed(0)}%
                                      </span>
                                    ) : (
                                      <span className="text-muted/30">-</span>
                                    )}
                                  </td>
                                )
                              })}
                              <td className="text-center px-3 py-3 font-semibold text-emerald-600 dark:text-emerald-400">
                                {total.toFixed(0)}%
                              </td>
                              <td className="text-center px-3 py-3 text-muted">
                                {profile.employeeCount}
                              </td>
                              <td className="text-center px-3 py-3">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => handleExpand(profile)}
                                    className="p-1.5 rounded-lg hover:bg-surface text-muted hover:text-foreground transition-colors"
                                    title="Edit weights"
                                  >
                                    <ChevronDown className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteProfile(profile.id)}
                                    className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted hover:text-red-500 transition-colors"
                                    title="Delete profile"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </>
                          )}
                        </motion.tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </>
        )}

        {/* Info Box */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-6"
        >
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-indigo-900 dark:text-indigo-200 mb-2">How Weight Profiles Work</h3>
              <ul className="text-sm text-indigo-800 dark:text-indigo-300 space-y-1">
                <li>Each employee is assigned evaluators from various categories (Lead, Direct Reports, Peer, HR, Hamiz, Dept).</li>
                <li>The specific combination of categories determines which weight profile applies.</li>
                <li>For example, an employee with only &quot;Direct Reports&quot; and &quot;HR&quot; evaluators gets 95%/5% weighting.</li>
                <li>&quot;Hamiz&quot; refers to C-Level evaluation. &quot;Dept&quot; is the whole-department evaluation done by Hamiz.</li>
                <li>Weights must sum to 100% for each profile. Click the expand arrow to edit.</li>
              </ul>
            </div>
          </div>
        </motion.div>

        <PageFooter />
      </PageContent>
    </PageContainer>
  )
}
