'use client'

import { useCallback, useEffect, useState } from 'react'
import Papa from 'papaparse'
import { AlertCircle, ArrowRight, Edit2, Link2, Plus, Search, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { ProgressiveBlur } from '@/components/ui/progressive-blur'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { RELATIONSHIP_TYPE_LABELS, type RelationshipType } from '@/types'

interface Person { id: string; name: string; department: string | null }

interface Mapping {
  id: string
  evaluatorId: string
  evaluateeId: string
  relationshipType: RelationshipType
  evaluator: Person
  evaluatee: Person
}

interface User extends Person { role: string }

type CsvRow = Record<string, string>
type ImportFormat = 'workbook' | 'simple'

/** What an import reports back: counts and the rows or profiles it could not apply. */
interface ImportResult {
  mappingsCreated?: number
  created?: number
  errors?: string[]
  validation?: { mismatchedProfiles?: Array<{ displayName: string }> }
  warnings?: {
    unmatchedCategorySets?: Array<{ categorySetKey: string; employeeCount: number }>
    mismatchedEmployees?: Array<{ employeeName: string; categorySetKey: string }>
  }
}

const RELATIONSHIP_TYPES = Object.keys(RELATIONSHIP_TYPE_LABELS) as RelationshipType[]
const EMPTY_FORM = { evaluatorId: '', evaluateeId: '', relationshipType: 'PEER' as RelationshipType }
const PREVIEW_ROWS = 5
const PREVIEW_COLUMNS = 6

const initials = (name: string) => name.split(' ').map((part) => part[0]).join('').slice(0, 2)

/** Every problem an import reported, as lines HR can read in the dialog. */
function importProblems(result: ImportResult): string[] {
  return [
    ...(result.errors ?? []),
    ...(result.validation?.mismatchedProfiles ?? []).map((p) => `Workbook profile does not match the mappings: ${p.displayName}`),
    ...(result.warnings?.unmatchedCategorySets ?? []).map((s) => `No saved weight profile for ${s.categorySetKey} (${s.employeeCount} people)`),
    ...(result.warnings?.mismatchedEmployees ?? []).map((e) => `${e.employeeName} does not match the weight profile ${e.categorySetKey}`),
  ]
}

/**
 * The evaluator mappings as a searchable table, with add, edit, delete and the workbook/CSV import.
 * `onChanged` runs after every change so the graph view stays in step.
 */
export function MappingsTable({ onChanged }: { onChanged: () => void }) {
  const [mappings, setMappings] = useState<Mapping[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<RelationshipType | 'all'>('all')
  const [filterPerson, setFilterPerson] = useState('all')
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingMapping, setEditingMapping] = useState<Mapping | null>(null)
  const [formData, setFormData] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [mappingToDelete, setMappingToDelete] = useState<Mapping | null>(null)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [importFormat, setImportFormat] = useState<ImportFormat>('workbook')
  const [clearBeforeImport, setClearBeforeImport] = useState(true)
  const [csvRows, setCsvRows] = useState<CsvRow[]>([])
  const [workbookFile, setWorkbookFile] = useState<File | null>(null)
  const [importFileName, setImportFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [importProblemsList, setImportProblemsList] = useState<string[]>([])

  const loadData = useCallback(async () => {
    try {
      const [mappingsRes, usersRes] = await Promise.all([fetch('/api/admin/mappings'), fetch('/api/users')])
      if (!mappingsRes.ok || !usersRes.ok) throw new Error('Failed to load mappings')
      const [mappingsData, usersData] = await Promise.all([mappingsRes.json(), usersRes.json()])
      setMappings(mappingsData.mappings ?? [])
      setUsers(usersData.users ?? [])
    } catch {
      toast.error('Could not load the mappings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadData() }, [loadData])

  async function refreshAfterChange() {
    await loadData()
    onChanged()
  }

  function openForm(mapping: Mapping | null) {
    setEditingMapping(mapping)
    setFormData(mapping ? { evaluatorId: mapping.evaluatorId, evaluateeId: mapping.evaluateeId, relationshipType: mapping.relationshipType } : EMPTY_FORM)
    setIsFormOpen(true)
  }

  function closeForm() {
    setIsFormOpen(false)
    setEditingMapping(null)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!formData.evaluatorId || !formData.evaluateeId) return void toast.error('Choose both the evaluator and the person evaluated')
    if (formData.evaluatorId === formData.evaluateeId && formData.relationshipType !== 'SELF') return void toast.error('Someone can evaluate themselves only with the Self relationship')
    setSaving(true)
    try {
      // An edit replaces the mapping: the old one goes first, so a unique pair can be re-created with a new type.
      if (editingMapping) {
        const removed = await fetch(`/api/admin/mappings?id=${editingMapping.id}`, { method: 'DELETE' })
        if (!removed.ok) throw new Error((await removed.json().catch(() => ({}))).error ?? 'Could not update the mapping')
      }
      const res = await fetch('/api/admin/mappings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.error) throw new Error(data.error ?? 'Could not save the mapping')
      toast.success(editingMapping ? 'Mapping updated' : 'Mapping added')
      closeForm()
      await refreshAfterChange()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the mapping')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!mappingToDelete) return
    try {
      const res = await fetch(`/api/admin/mappings?id=${mappingToDelete.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.error) throw new Error(data.error ?? 'Could not delete the mapping')
      toast.success('Mapping deleted')
      await refreshAfterChange()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete the mapping')
    } finally {
      setMappingToDelete(null)
    }
  }

  function resetImport() {
    setCsvRows([])
    setWorkbookFile(null)
    setImportFileName('')
    setImportProblemsList([])
  }

  function closeImport() {
    setIsImportOpen(false)
    resetImport()
  }

  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    resetImport()
    setImportFileName(file.name)
    if (file.name.toLowerCase().endsWith('.xlsx')) {
      setWorkbookFile(file)
      setImportFormat('workbook')
      return
    }
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data }) => {
        setCsvRows(data)
        // A sheet exported from the mappings workbook has these columns; anything else is the simple format.
        const first = data[0]
        if (first) setImportFormat('Team Lead 1' in first || ('Name' in first && 'Designation' in first) ? 'workbook' : 'simple')
      },
      error: () => toast.error('Could not read the CSV file'),
    })
  }

  async function sendImport(): Promise<Response> {
    if (importFormat === 'simple') {
      return fetch('/api/admin/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'mappings', data: csvRows }) })
    }
    if (workbookFile) {
      const body = new FormData()
      body.append('file', workbookFile)
      body.append('clearExisting', String(clearBeforeImport))
      return fetch('/api/admin/import-mappings', { method: 'POST', body })
    }
    return fetch('/api/admin/import-mappings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows: csvRows, clearExisting: clearBeforeImport }) })
  }

  async function handleImport() {
    if (!workbookFile && csvRows.length === 0) return void toast.error('Choose a file to import first')
    setImporting(true)
    try {
      const res = await sendImport()
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.error) throw new Error(data.error ?? 'The import failed')
      const result: ImportResult = data.result ?? data
      const problems = importProblems(result)
      toast.success(`Import complete: ${result.mappingsCreated ?? result.created ?? 0} mappings created`)
      await refreshAfterChange()
      // With problems the dialog stays open to list them; otherwise it closes.
      if (problems.length) {
        setCsvRows([])
        setWorkbookFile(null)
        setImportProblemsList(problems)
      } else {
        closeImport()
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The import failed')
    } finally {
      setImporting(false)
    }
  }

  const search = searchTerm.trim().toLowerCase()
  const shown = mappings.filter((m) =>
    (!search || m.evaluator.name.toLowerCase().includes(search) || m.evaluatee.name.toLowerCase().includes(search)) &&
    (filterType === 'all' || m.relationshipType === filterType) &&
    (filterPerson === 'all' || m.evaluateeId === filterPerson || m.evaluatorId === filterPerson),
  )
  const preview = csvRows.slice(0, PREVIEW_ROWS)
  const previewColumns = preview[0] ? Object.keys(preview[0]) : []

  if (loading) return <p className="py-12 text-center text-sm text-muted-foreground">Loading mappings…</p>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by name…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" aria-label="Search mappings by name" />
        </div>
        <Select value={filterType} onValueChange={(value) => setFilterType(value as RelationshipType | 'all')}>
          <SelectTrigger className="w-[180px]" aria-label="Relationship"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All relationships</SelectItem>
            {RELATIONSHIP_TYPES.map((t) => <SelectItem key={t} value={t}>{RELATIONSHIP_TYPE_LABELS[t]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterPerson} onValueChange={setFilterPerson}>
          <SelectTrigger className="w-[200px]" aria-label="Person"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Everyone</SelectItem>
            {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={() => setIsImportOpen(true)}><Upload className="h-4 w-4" />Import workbook or CSV</Button>
        <Button onClick={() => openForm(null)}><Plus className="h-4 w-4" />Add mapping</Button>
      </div>
      <p className="text-sm text-muted-foreground">{shown.length === mappings.length ? `${mappings.length} mappings` : `${shown.length} of ${mappings.length} mappings`}</p>

      {shown.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Link2 className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">No mappings match</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {shown.map((mapping) => (
            <Card key={mapping.id}>
              <CardContent className="flex items-center gap-4 p-4">
                <PersonCell person={mapping.evaluator} tone="from-indigo-500 to-purple-500" />
                <div className="flex shrink-0 items-center gap-2 px-3">
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <Badge variant="secondary">{RELATIONSHIP_TYPE_LABELS[mapping.relationshipType]}</Badge>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
                <PersonCell person={mapping.evaluatee} tone="from-emerald-500 to-teal-500" />
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="icon" aria-label={`Edit ${mapping.evaluator.name} to ${mapping.evaluatee.name}`} onClick={() => openForm(mapping)}><Edit2 className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" aria-label={`Delete ${mapping.evaluator.name} to ${mapping.evaluatee.name}`} onClick={() => setMappingToDelete(mapping)} className="text-destructive hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Modal isOpen={isFormOpen} onClose={closeForm} title={editingMapping ? 'Edit mapping' : 'Add mapping'}>
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <PersonSelect label="Evaluator (who evaluates)" value={formData.evaluatorId} users={users} onChange={(evaluatorId) => setFormData({ ...formData, evaluatorId })} />
          <div className="space-y-2">
            <Label>Relationship</Label>
            <Select value={formData.relationshipType} onValueChange={(value) => setFormData({ ...formData, relationshipType: value as RelationshipType })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{RELATIONSHIP_TYPES.map((t) => <SelectItem key={t} value={t}>{RELATIONSHIP_TYPE_LABELS[t]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <PersonSelect label="Evaluated (who is evaluated)" value={formData.evaluateeId} users={users} onChange={(evaluateeId) => setFormData({ ...formData, evaluateeId })} />
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={closeForm}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isImportOpen} onClose={closeImport} title="Import mappings" size="lg">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-4 rounded-lg bg-muted p-4">
            <label className="flex cursor-pointer items-center gap-2">
              <input type="radio" checked={importFormat === 'workbook'} onChange={() => setImportFormat('workbook')} className="h-4 w-4" />
              <span>Workbook (Sheet1 mappings, Sheet2 profiles)</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input type="radio" checked={importFormat === 'simple'} onChange={() => setImportFormat('simple')} className="h-4 w-4" />
              <span>Simple CSV (evaluator, evaluatee, type)</span>
            </label>
          </div>

          {importFormat === 'workbook' && (
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
              <input type="checkbox" checked={clearBeforeImport} onChange={(e) => setClearBeforeImport(e.target.checked)} className="h-4 w-4 rounded" />
              <div>
                <span className="font-medium">Replace all current mappings</span>
                <p className="text-xs text-muted-foreground">Deletes every current mapping and keeps only what the file contains.</p>
              </div>
            </label>
          )}

          <div className="rounded-lg border-2 border-dashed border-input p-8 text-center">
            <input type="file" accept=".xlsx,.csv" onChange={handleFile} className="hidden" id="mappings-upload" />
            <label htmlFor="mappings-upload" className="cursor-pointer">
              <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
              <p className="font-medium">Choose a workbook or CSV</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {importFormat === 'workbook' ? 'Sheet1 holds the mappings and Sheet2 the profiles. A CSV of Sheet1 also works.' : 'Columns: evaluator_name, evaluatee_name, relationship_type'}
              </p>
              {importFileName && <p className="mt-2 text-xs text-muted-foreground">Chosen: {importFileName}</p>}
            </label>
          </div>

          {workbookFile && (
            <div className="rounded-lg bg-muted p-4 text-sm">
              <p className="font-medium">Workbook ready</p>
              <p className="mt-1 text-muted-foreground">Sheet1 imports the mappings, Sheet2 updates the workbook weight profiles, and the import checks each profile's members against the mappings.</p>
            </div>
          )}

          {preview.length > 0 && (
            <div className="rounded-lg bg-muted p-4">
              <p className="mb-2 text-sm font-medium">Preview ({csvRows.length} rows)</p>
              <div className="relative">
                <ProgressiveBlur position="bottom" height={24} />
                <div className="max-h-48 overflow-auto text-xs">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {previewColumns.slice(0, PREVIEW_COLUMNS).map((key) => <TableHead key={key} className="px-2 py-1">{key}</TableHead>)}
                        {previewColumns.length > PREVIEW_COLUMNS && <TableHead className="px-2 py-1">…</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.map((row, i) => (
                        <TableRow key={i}>
                          {previewColumns.slice(0, PREVIEW_COLUMNS).map((key) => <TableCell key={key} className="max-w-[150px] truncate px-2 py-1">{row[key] || '-'}</TableCell>)}
                          {previewColumns.length > PREVIEW_COLUMNS && <TableCell className="px-2 py-1">…</TableCell>}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}

          {importFormat === 'workbook' && csvRows.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/10 p-3 text-sm">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div>
                <p className="font-medium">How workbook rows become mappings</p>
                <p className="text-muted-foreground">Team Lead columns become Team Lead except Hamiz, who maps to the Hamiz/C-Level bucket. Reporting Team Members become Direct Reports, HR and Dept constants are synced automatically, and Hamiz, Daniyal, Brad, Maryam, and Richard do not receive incoming evaluators.</p>
              </div>
            </div>
          )}

          {importProblemsList.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm" role="status">
              <p className="font-medium">The import finished, but {importProblemsList.length === 1 ? '1 thing needs' : `${importProblemsList.length} things need`} a look</p>
              <ul className="mt-2 max-h-48 list-disc space-y-1 overflow-y-auto pl-5 text-muted-foreground">
                {importProblemsList.map((problem, i) => <li key={i}>{problem}</li>)}
              </ul>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={closeImport}>{importProblemsList.length ? 'Close' : 'Cancel'}</Button>
            {importProblemsList.length === 0 && (
              <Button onClick={() => void handleImport()} disabled={importing || (!workbookFile && csvRows.length === 0)}>
                {importing ? 'Importing…' : workbookFile ? 'Import workbook' : `Import ${csvRows.length} rows`}
              </Button>
            )}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={mappingToDelete !== null}
        onClose={() => setMappingToDelete(null)}
        onConfirm={() => void handleDelete()}
        title="Delete mapping?"
        message={mappingToDelete ? `${mappingToDelete.evaluator.name} will no longer evaluate ${mappingToDelete.evaluatee.name} as ${RELATIONSHIP_TYPE_LABELS[mappingToDelete.relationshipType]}.` : ''}
        confirmText="Delete"
        variant="danger"
      />
    </div>
  )
}

function PersonCell({ person, tone }: { person: Person; tone: string }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${tone} text-sm font-medium text-white`}>{initials(person.name)}</div>
      <div className="min-w-0">
        <div className="truncate font-medium">{person.name}</div>
        <div className="truncate text-xs text-muted-foreground">{person.department || 'No department'}</div>
      </div>
    </div>
  )
}

function PersonSelect({ label, value, users, onChange }: { label: string; value: string; users: User[]; onChange: (id: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="Choose a person…" /></SelectTrigger>
        <SelectContent>{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}{u.department ? ` (${u.department})` : ''}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  )
}
