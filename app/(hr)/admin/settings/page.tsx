'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { RelationshipType, RELATIONSHIP_TYPE_LABELS } from '@/types'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
  const [profiles, setProfiles] = useState<WeightProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [expandedProfile, setExpandedProfile] = useState<string | null>(null)
  const [editWeights, setEditWeights] = useState<Record<string, number>>({})

  useEffect(() => {
    loadProfiles()
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
      <div className="p-6 sm:p-8 max-w-7xl mx-auto">
        <LoadingScreen message="Loading settings..." />
      </div>
    )
  }

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground font-display">Weight Profiles</h1>
            <p className="text-muted-foreground mt-1">
              Each employee&apos;s weight profile is determined by their set of evaluator categories.
              Employees with the same evaluator types share the same weights.
            </p>
          </div>
          <Button
            onClick={handleSeedProfiles}
            disabled={seeding}
          >
            <Upload className="w-4 h-4" />
            {seeding ? 'Seeding...' : 'Seed Q4 2025 Profiles'}
          </Button>
        </div>

        {profiles.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card>
              <CardContent className="p-12 text-center">
                <Sliders className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">No Weight Profiles</h3>
                <p className="text-muted-foreground mb-6">
                  Click &quot;Seed Q4 2025 Profiles&quot; to import the 10 weight profiles from the compiled spreadsheet.
                </p>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <>
            {/* Weight Profile Table */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6"
            >
              <Card>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-semibold">Category Set</TableHead>
                        {ALL_TYPES.map(type => (
                          <TableHead key={type} className="text-center whitespace-nowrap">
                            {TYPE_SHORT_LABELS[type]}
                          </TableHead>
                        ))}
                        <TableHead className="text-center">Total</TableHead>
                        <TableHead className="text-center">
                          <Users className="w-4 h-4 inline" />
                        </TableHead>
                        <TableHead className="text-center">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {profiles.map((profile, idx) => {
                        const total = Object.values(profile.weights).reduce((s, w) => s + w, 0) * 100
                        const isExpanded = expandedProfile === profile.id

                        return (
                          <motion.tr
                            key={profile.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: idx * 0.03 }}
                            className="border-b transition-colors hover:bg-muted/30"
                          >
                            {isExpanded ? (
                              <TableCell colSpan={ALL_TYPES.length + 4} className="px-4 py-4">
                                <div className="space-y-4">
                                  <div className="flex items-center justify-between">
                                    <span className="font-medium text-foreground">{profile.displayName}</span>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => setExpandedProfile(null)}
                                    >
                                      <ChevronUp className="w-4 h-4" />
                                    </Button>
                                  </div>

                                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                                    {ALL_TYPES.map(type => {
                                      const isInSet = profile.categorySetKey.includes(type)
                                      return (
                                        <div key={type} className="space-y-1">
                                          <Label className="text-xs text-muted-foreground">
                                            {TYPE_SHORT_LABELS[type]}
                                          </Label>
                                          <div className="flex items-center gap-1">
                                            <Input
                                              type="number"
                                              min={0}
                                              max={100}
                                              step={1}
                                              disabled={!isInSet}
                                              value={isInSet ? ((editWeights[type] || 0) * 100).toFixed(0) : ''}
                                              onChange={(e) => handleWeightChange(type, parseFloat(e.target.value) || 0)}
                                              className="text-center text-sm disabled:opacity-30 disabled:cursor-not-allowed"
                                            />
                                            <span className="text-xs text-muted-foreground">%</span>
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
                                    <Button
                                      onClick={() => handleSaveProfile(profile)}
                                      disabled={saving || Math.abs(getEditTotal() - 100) > 1}
                                      size="sm"
                                    >
                                      <Save className="w-3.5 h-3.5" />
                                      {saving ? 'Saving...' : 'Save'}
                                    </Button>
                                  </div>
                                </div>
                              </TableCell>
                            ) : (
                              <>
                                <TableCell className="font-medium max-w-[280px]">
                                  <span className="truncate block" title={profile.displayName}>
                                    {profile.displayName}
                                  </span>
                                </TableCell>
                                {ALL_TYPES.map(type => {
                                  const w = (profile.weights[type] || 0) as number
                                  return (
                                    <TableCell key={type} className="text-center">
                                      {w > 0 ? (
                                        <Badge variant="secondary" className="min-w-[48px]">
                                          {(w * 100).toFixed(0)}%
                                        </Badge>
                                      ) : (
                                        <span className="text-muted-foreground/30">-</span>
                                      )}
                                    </TableCell>
                                  )
                                })}
                                <TableCell className="text-center font-semibold text-emerald-600 dark:text-emerald-400">
                                  {total.toFixed(0)}%
                                </TableCell>
                                <TableCell className="text-center text-muted-foreground">
                                  {profile.employeeCount}
                                </TableCell>
                                <TableCell className="text-center">
                                  <div className="flex items-center justify-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleExpand(profile)}
                                      title="Edit weights"
                                    >
                                      <ChevronDown className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleDeleteProfile(profile.id)}
                                      className="hover:bg-destructive/10 hover:text-destructive"
                                      title="Delete profile"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </>
                            )}
                          </motion.tr>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </motion.div>
          </>
        )}

        {/* Info Box */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="bg-primary/10 border-primary/20">
            <CardContent className="p-6">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-primary mb-2">How Weight Profiles Work</h3>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>Each employee is assigned evaluators from various categories (Lead, Direct Reports, Peer, HR, Hamiz, Dept).</li>
                    <li>The specific combination of categories determines which weight profile applies.</li>
                    <li>For example, an employee with only &quot;Direct Reports&quot; and &quot;HR&quot; evaluators gets 95%/5% weighting.</li>
                    <li>&quot;Hamiz&quot; refers to C-Level evaluation. &quot;Dept&quot; is the whole-department evaluation done by Hamiz.</li>
                    <li>Weights must sum to 100% for each profile. Click the expand arrow to edit.</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

    </div>
  )
}

