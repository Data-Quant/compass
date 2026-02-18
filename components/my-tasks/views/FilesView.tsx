'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { ExternalLink, Pencil, Trash2 } from 'lucide-react'

interface ProjectOption {
  id: string
  name: string
}

interface ProjectReference {
  id: string
  projectId: string
  title: string
  url: string | null
  note: string | null
  updatedAt: string
  project: { id: string; name: string; color: string | null }
  createdBy: { id: string; name: string }
}

interface MyTasksFilesViewProps {
  projects: ProjectOption[]
  selectedProjectId: string | null
}

export function MyTasksFilesView({ projects, selectedProjectId }: MyTasksFilesViewProps) {
  const [references, setReferences] = useState<ProjectReference[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    projectId: selectedProjectId || projects[0]?.id || '',
    title: '',
    url: '',
    note: '',
  })

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      projectId: selectedProjectId || prev.projectId || projects[0]?.id || '',
    }))
  }, [projects, selectedProjectId])

  const loadReferences = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (selectedProjectId) params.set('projectId', selectedProjectId)
      const response = await fetch(`/api/projects/references${params.toString() ? `?${params.toString()}` : ''}`)
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error || 'Failed to load references')
      setReferences(payload.references || [])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load references')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadReferences()
  }, [selectedProjectId])

  const createReference = async () => {
    if (!form.projectId || !form.title.trim()) {
      toast.error('Project and title are required')
      return
    }
    try {
      setSaving(true)
      const response = await fetch('/api/projects/references', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: form.projectId,
          title: form.title,
          url: form.url,
          note: form.note,
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error || 'Failed to create reference')
      setForm((prev) => ({ ...prev, title: '', url: '', note: '' }))
      toast.success('Reference added')
      loadReferences()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create reference')
    } finally {
      setSaving(false)
    }
  }

  const deleteReference = async (id: string) => {
    try {
      const response = await fetch(`/api/projects/references/${id}`, { method: 'DELETE' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error || 'Failed to delete reference')
      toast.success('Reference deleted')
      loadReferences()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete reference')
    }
  }

  const saveInlineEdit = async (item: ProjectReference) => {
    try {
      setSaving(true)
      const response = await fetch(`/api/projects/references/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: item.title,
          url: item.url,
          note: item.note,
        }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error || 'Failed to update reference')
      setEditingId(null)
      toast.success('Reference updated')
      loadReferences()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update reference')
    } finally {
      setSaving(false)
    }
  }

  const referencesById = useMemo(
    () => Object.fromEntries(references.map((reference) => [reference.id, reference])),
    [references]
  )

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Add reference</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Project</Label>
              <Select value={form.projectId} onValueChange={(projectId) => setForm((prev) => ({ ...prev, projectId }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Title</Label>
              <Input value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} placeholder="Payroll run checklist" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">URL (optional)</Label>
              <Input value={form.url} onChange={(event) => setForm((prev) => ({ ...prev, url: event.target.value }))} placeholder="https://..." />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Note</Label>
              <Textarea value={form.note} onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))} rows={2} placeholder="Context for this link..." />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={createReference} disabled={saving}>Add</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Project references</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading references...</p>
          ) : references.length === 0 ? (
            <p className="text-sm text-muted-foreground">No references yet.</p>
          ) : references.map((reference) => {
            const editable = editingId === reference.id
            const item = referencesById[reference.id]
            return (
              <div key={reference.id} className="rounded-lg border border-border/50 p-3">
                {editable ? (
                  <div className="space-y-2">
                    <Input
                      value={item.title}
                      onChange={(event) => setReferences((prev) => prev.map((entry) => (
                        entry.id === reference.id ? { ...entry, title: event.target.value } : entry
                      )))}
                    />
                    <Input
                      value={item.url || ''}
                      onChange={(event) => setReferences((prev) => prev.map((entry) => (
                        entry.id === reference.id ? { ...entry, url: event.target.value } : entry
                      )))}
                    />
                    <Textarea
                      value={item.note || ''}
                      rows={2}
                      onChange={(event) => setReferences((prev) => prev.map((entry) => (
                        entry.id === reference.id ? { ...entry, note: event.target.value } : entry
                      )))}
                    />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                      <Button size="sm" onClick={() => saveInlineEdit(item)} disabled={saving}>Save</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{reference.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {reference.project.name} • Updated {new Date(reference.updatedAt).toLocaleDateString()}
                      </p>
                      {reference.note && (
                        <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{reference.note}</p>
                      )}
                      {reference.url && (
                        <a
                          href={reference.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          Open link
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setEditingId(reference.id)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => deleteReference(reference.id)}>
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>
    </div>
  )
}
