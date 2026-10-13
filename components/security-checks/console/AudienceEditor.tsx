'use client'

import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { resolveAudience, type AudienceRules } from '@/lib/security-checks/audience'
import { scRequest } from '../sc-api'

interface Person {
  id: string
  name: string
  department: string | null
  teamTag: string | null
}

interface Directory {
  people: Person[]
  departments: string[]
  teams: string[]
}

const toggle = (list: string[], value: string) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value])

function PersonPicker({ label, people, selected, onChange, disabled }: { label: string; people: Person[]; selected: string[]; onChange: (ids: string[]) => void; disabled: boolean }) {
  const [query, setQuery] = useState('')
  const byId = new Map(people.map((person) => [person.id, person]))
  const matches = query.trim().length < 2 ? [] : people.filter((person) => !selected.includes(person.id) && person.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2">
        {selected.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
            {byId.get(id)?.name ?? 'Former employee'}
            {!disabled && <button type="button" aria-label="Remove" onClick={() => onChange(selected.filter((item) => item !== id))}><X className="h-3 w-3" /></button>}
          </span>
        ))}
      </div>
      {!disabled && (
        <div className="relative">
          <Input value={query} placeholder="Type a name…" onChange={(event) => setQuery(event.target.value)} />
          {matches.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-popover shadow">
              {matches.map((person) => (
                <button key={person.id} type="button" className="block w-full px-3 py-1.5 text-left text-sm hover:bg-muted" onClick={() => { onChange([...selected, person.id]); setQuery('') }}>
                  {person.name} <span className="text-muted-foreground">{person.department ?? ''}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function AudienceEditor({ value, disabled, onChange }: { value: AudienceRules; disabled: boolean; onChange: (value: AudienceRules) => void }) {
  const [directory, setDirectory] = useState<Directory | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    scRequest<Directory>('/api/security-checks/console/directory')
      .then(setDirectory)
      .catch(() => setError('Could not load the employee directory'))
  }, [])

  const count = useMemo(
    () => (directory ? resolveAudience(value, directory.people.map((person) => ({ ...person, active: true }))).length : 0),
    [directory, value],
  )

  if (error) return <p className="text-sm text-destructive">{error}</p>
  if (!directory) return <p className="text-sm text-muted-foreground">Loading directory…</p>
  const set = (patch: Partial<AudienceRules>) => onChange({ ...value, ...patch })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Switch id="audience-all" checked={value.all} disabled={disabled} onCheckedChange={(checked) => set({ all: checked })} />
        <Label htmlFor="audience-all">Whole company</Label>
      </div>
      {!value.all && (
        <>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Departments</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {directory.departments.map((department) => (
                <label key={department} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={value.departments.includes(department)} disabled={disabled} onCheckedChange={() => set({ departments: toggle(value.departments, department) })} />
                  {department}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Teams</legend>
            <div className="grid gap-2 sm:grid-cols-4">
              {directory.teams.map((team) => (
                <label key={team} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={value.teams.includes(team)} disabled={disabled} onCheckedChange={() => set({ teams: toggle(value.teams, team) })} />
                  {team.replace(/_/g, ' ').toLowerCase()}
                </label>
              ))}
            </div>
          </fieldset>
          <PersonPicker label="Individuals" people={directory.people} selected={value.userIds} disabled={disabled} onChange={(userIds) => set({ userIds })} />
        </>
      )}
      <PersonPicker label="Exclude" people={directory.people} selected={value.excludeUserIds} disabled={disabled} onChange={(excludeUserIds) => set({ excludeUserIds })} />
      <p className="text-sm text-muted-foreground">{count} active {count === 1 ? 'person' : 'people'} in scope today.</p>
    </div>
  )
}
