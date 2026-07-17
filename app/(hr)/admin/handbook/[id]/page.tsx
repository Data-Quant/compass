'use client'

import { use, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { ArrowLeft, Plus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { VariantEditor, type EditableVariant } from '@/components/handbook/VariantEditor'
import { ALL_TEAMS, TEAM_LABELS } from '@/lib/handbook/teams'
import { cn } from '@/lib/utils'

type AdminPage = {
  id: string
  slug: string
  title: string
  icon: string
  category: string
  orderIndex: number
  linkHref: string | null
  linkLabel: string | null
  isPublished: boolean
  description: string | null
  layout: 'POLICY' | 'LETTER' | null
  intentionalGapTeams: string[]
  variants: EditableVariant[]
}

export default function AdminHandbookPageEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [page, setPage] = useState<AdminPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    return fetch('/api/admin/handbook')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          toast.error(d.error)
          return
        }
        const found = (d.pages || []).find((p: AdminPage) => p.id === id) || null
        setPage(found)
      })
      .catch(() => toast.error('Failed to load page'))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const savePage = async (patch: Partial<AdminPage>) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/handbook/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json()
      if (data.error) {
        toast.error(data.error)
        return
      }
      toast.success('Page saved')
      await load()
    } catch {
      toast.error('Failed to save page')
    } finally {
      setSaving(false)
    }
  }

  const addVariant = async () => {
    // A new variant needs at least one team, and only uncovered teams are
    // available -- an overlap would be rejected by the API anyway.
    const covered = new Set(page?.variants.flatMap((v) => v.audiences) ?? [])
    const firstFree = ALL_TEAMS.find((t) => !covered.has(t))
    if (!firstFree) {
      toast.error('Every team is already covered by a variant on this page')
      return
    }

    try {
      const res = await fetch(`/api/admin/handbook/${id}/variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bodyMarkdown: '', audiences: [firstFree] }),
      })
      const data = await res.json()
      if (data.error) {
        toast.error(data.error)
        return
      }
      await load()
    } catch {
      toast.error('Failed to add variant')
    }
  }

  if (loading) return <LoadingScreen />
  if (!page) {
    return (
      <div className="p-6 sm:p-8 max-w-4xl mx-auto">
        <Link
          href="/admin/handbook"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Coverage grid
        </Link>
        <p className="text-muted-foreground">Page not found.</p>
      </div>
    )
  }

  const coveredTeams = new Set(page.variants.flatMap((v) => v.audiences))
  const gapTeams = ALL_TEAMS.filter((t) => !coveredTeams.has(t))

  return (
    <div className="p-6 sm:p-8 max-w-5xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <Link
          href="/admin/handbook"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Coverage grid
        </Link>
        <h1 className="text-2xl sm:text-3xl font-display font-light tracking-tight text-foreground">
          {page.title}
        </h1>
        <p className="text-muted-foreground mt-1">/handbook/{page.slug}</p>
      </motion.div>

      <Card className="mb-6">
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="title" className="mb-1">
                Title
              </Label>
              <Input
                id="title"
                defaultValue={page.title}
                onBlur={(e) => e.target.value !== page.title && savePage({ title: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="icon" className="mb-1">
                Icon (lucide name)
              </Label>
              <Input
                id="icon"
                defaultValue={page.icon}
                onBlur={(e) => e.target.value !== page.icon && savePage({ icon: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="linkHref" className="mb-1">
                Action link (optional)
              </Label>
              <Input
                id="linkHref"
                defaultValue={page.linkHref || ''}
                placeholder="/leave"
                onBlur={(e) =>
                  e.target.value !== (page.linkHref || '') &&
                  savePage({ linkHref: e.target.value || null })
                }
              />
            </div>
            <div>
              <Label htmlFor="linkLabel" className="mb-1">
                Action label (optional)
              </Label>
              <Input
                id="linkLabel"
                defaultValue={page.linkLabel || ''}
                placeholder="Apply for leave"
                onBlur={(e) =>
                  e.target.value !== (page.linkLabel || '') &&
                  savePage({ linkLabel: e.target.value || null })
                }
              />
            </div>
          </div>

          <div>
            <Label htmlFor="description" className="mb-1">
              Description
            </Label>
            <Input
              id="description"
              defaultValue={page.description || ''}
              placeholder="One line — shown under the title and searched over"
              onBlur={(e) =>
                e.target.value !== (page.description || '') &&
                savePage({ description: e.target.value || null })
              }
            />
            <p className="text-xs text-muted-foreground mt-1">
              Employees see this under the page title, and search matches against it. On a letter it
              also appears as the label above the body.
            </p>
          </div>

          <div>
            <Label htmlFor="layout" className="mb-1">
              Layout
            </Label>
            <Select
              value={page.layout ?? 'POLICY'}
              onValueChange={(v) => savePage({ layout: v as 'POLICY' | 'LETTER' })}
            >
              <SelectTrigger id="layout">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="POLICY">Policy — the calm default</SelectItem>
                <SelectItem value="LETTER">Letter — serif, for correspondence</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium text-foreground">Published</p>
              <p className="text-xs text-muted-foreground">
                Unpublished pages are hidden from everyone.
              </p>
            </div>
            <Switch
              checked={page.isPublished}
              onCheckedChange={(v) => savePage({ isPublished: v })}
              disabled={saving}
            />
          </div>

          {gapTeams.length > 0 && (
            <div className="rounded-lg border border-border p-3">
              <p className="text-sm font-medium text-foreground mb-1">Teams with no variant</p>
              <p className="text-xs text-muted-foreground mb-3">
                Mark a gap as intentional to record that it is deliberate — it will stop flagging on
                the grid.
              </p>
              <div className="flex flex-wrap gap-2">
                {gapTeams.map((team) => {
                  const intentional = page.intentionalGapTeams.includes(team)
                  return (
                    <button
                      key={team}
                      type="button"
                      onClick={() =>
                        savePage({
                          intentionalGapTeams: intentional
                            ? page.intentionalGapTeams.filter((t) => t !== team)
                            : [...page.intentionalGapTeams, team],
                        })
                      }
                      className={cn(
                        'rounded-badge border px-3 py-1 text-xs transition-colors',
                        intentional
                          ? 'border-border text-muted-foreground hover:bg-muted'
                          : 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20'
                      )}
                    >
                      {TEAM_LABELS[team]} {intentional ? '– intentional' : '⚠ needs a decision'}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">Variants ({page.variants.length})</h2>
        <Button variant="outline" size="sm" onClick={addVariant}>
          <Plus className="h-4 w-4 mr-1.5" />
          Add variant
        </Button>
      </div>

      {page.variants.map((v) => (
        <VariantEditor key={v.id} variant={v} onSaved={load} onDeleted={load} />
      ))}
    </div>
  )
}
