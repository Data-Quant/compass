'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Textarea } from '@/components/ui/textarea'
import { UserAvatar } from '@/components/composed/UserAvatar'
import { cn } from '@/lib/utils'
import type { WorkspacePerson } from './workspace-types'

interface CreateProjectInput {
  name: string
  description: string
  color: string | null
  memberIds: string[]
}

interface ProjectCreationModalProps {
  open: boolean
  people: WorkspacePerson[]
  viewerId: string
  creating: boolean
  onClose: () => void
  onCreate: (input: CreateProjectInput) => Promise<boolean>
}

const PRESET_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#22c55e', '#06b6d4',
]

export function ProjectCreationModal({
  open,
  people,
  viewerId,
  creating,
  onClose,
  onCreate,
}: ProjectCreationModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState<string | null>(null)
  const [memberIds, setMemberIds] = useState<string[]>([])
  const [memberSearch, setMemberSearch] = useState('')

  useEffect(() => {
    if (!open) return
    setName('')
    setDescription('')
    setColor(null)
    setMemberIds([])
    setMemberSearch('')
  }, [open])

  const availablePeople = useMemo(() => people
    .filter((person) => person.id !== viewerId)
    .filter((person) => person.name.toLocaleLowerCase().includes(memberSearch.trim().toLocaleLowerCase())),
  [memberSearch, people, viewerId])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const cleanName = name.trim()
    if (!cleanName) return
    await onCreate({
      name: cleanName,
      description: description.trim(),
      color,
      memberIds,
    })
  }

  const toggleMember = (id: string) => {
    setMemberIds((current) => current.includes(id)
      ? current.filter((memberId) => memberId !== id)
      : [...current, id])
  }

  return (
    <Modal isOpen={open} onClose={onClose} title="New Project">
      <form onSubmit={submit} className="space-y-5">
        <div className="space-y-1.5">
          <Label htmlFor="new-project-name">Project name</Label>
          <Input
            id="new-project-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Q3 People Operations"
            autoFocus
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="new-project-description">Description (optional)</Label>
          <Textarea
            id="new-project-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What outcome should this project deliver?"
            rows={3}
          />
        </div>

        <fieldset>
          <legend className="text-sm font-medium">Project color</legend>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setColor(null)}
              aria-label="Use default project color"
              aria-pressed={color === null}
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded-full border-2 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                color === null ? 'scale-110 border-foreground' : 'border-border hover:scale-105',
              )}
            >
              <X className="h-3.5 w-3.5" />
            </button>
            {PRESET_COLORS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setColor(preset)}
                aria-label={`Use project color ${preset}`}
                aria-pressed={color === preset}
                className={cn(
                  'inline-flex h-8 w-8 items-center justify-center rounded-full transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  color === preset ? 'scale-110 ring-2 ring-foreground ring-offset-2 ring-offset-background' : 'hover:scale-105',
                )}
                style={{ backgroundColor: preset }}
              >
                {color === preset && <Check className="h-4 w-4 text-white" />}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="space-y-1.5">
          <Label htmlFor="new-project-member-search">Add members</Label>
          <div className="overflow-hidden rounded-lg border border-border/50">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="new-project-member-search"
                value={memberSearch}
                onChange={(event) => setMemberSearch(event.target.value)}
                placeholder="Search teammates"
                className="rounded-none border-0 border-b border-border/40 pl-9 shadow-none focus-visible:ring-0"
              />
            </div>
            <div className="max-h-44 space-y-0.5 overflow-y-auto p-1" role="listbox" aria-label="Project members" aria-multiselectable="true">
              {availablePeople.map((person) => {
                const selected = memberIds.includes(person.id)
                return (
                  <button
                    key={person.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => toggleMember(person.id)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      selected && 'bg-primary/5',
                    )}
                  >
                    <UserAvatar name={person.name} size="xs" />
                    <span className="flex-1">{person.name}</span>
                    {selected && <Check className="h-4 w-4 text-primary" />}
                  </button>
                )
              })}
              {availablePeople.length === 0 && (
                <p className="px-3 py-5 text-center text-xs text-muted-foreground">No teammates found.</p>
              )}
            </div>
          </div>
          {memberIds.length > 0 && (
            <p className="text-xs text-muted-foreground">{memberIds.length} selected</p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose} disabled={creating}>Cancel</Button>
          <Button type="submit" disabled={creating || !name.trim()}>
            {creating ? 'Creating...' : 'Create project'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
