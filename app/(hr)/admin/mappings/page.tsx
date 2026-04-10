'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { ProgressiveBlur } from '@/components/ui/progressive-blur'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { RELATIONSHIP_TYPE_LABELS, RelationshipType } from '@/types'
import Papa from 'papaparse'
import { Link2, Plus, Upload, Search, Trash2, ArrowRight, GitBranch, Edit2, AlertCircle } from 'lucide-react'

interface Mapping {
  id: string; evaluatorId: string; evaluateeId: string; relationshipType: RelationshipType
  evaluator: { id: string; name: string; department: string | null }
  evaluatee: { id: string; name: string; department: string | null }
}

interface User { id: string; name: string; department: string | null; role: string; position?: string }

interface ImportWarnings {
  unmatchedCategorySets?: Array<{
    categorySetKey: string
    employeeCount: number
    employeeNames: string[]
  }>
  mismatchedEmployees?: Array<{
    employeeName: string
    categorySetKey: string
  }>
}

interface ImportValidation {
  matchedProfiles: number
  mismatchedProfiles: Array<{
    displayName: string
    missingExpectedMembers: string[]
    unexpectedMembers: string[]
  }>
}

export default function MappingsPage() {
  const [mappings, setMappings] = useState<Mapping[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<string>('all')
  const [filterEmployee, setFilterEmployee] = useState<string>('all')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false)
  const [mappingToDelete, setMappingToDelete] = useState<Mapping | null>(null)
  const [editingMapping, setEditingMapping] = useState<Mapping | null>(null)
  const [formData, setFormData] = useState({ evaluatorId: '', evaluateeId: '', relationshipType: 'PEER' })
  const [saving, setSaving] = useState(false)
  const [importData, setImportData] = useState<any[]>([])
  const [importPreview, setImportPreview] = useState<any[]>([])
  const [workbookFile, setWorkbookFile] = useState<File | null>(null)
  const [importFileName, setImportFileName] = useState('')
  const [importing, setImporting] = useState(false)
  const [importFormat, setImportFormat] = useState<'simple' | 'q4'>('q4')
  const [clearBeforeImport, setClearBeforeImport] = useState(true)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      const [mappingsRes, usersRes] = await Promise.all([fetch('/api/admin/mappings'), fetch('/api/auth/login')])
      const mappingsData = await mappingsRes.json()
      const usersData = await usersRes.json()
      setMappings(mappingsData.mappings || [])
      setUsers(usersData.users || [])
    } catch { toast.error('Failed to load data') }
    finally { setLoading(false) }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.evaluatorId || !formData.evaluateeId) { toast.error('Select both evaluator and evaluatee'); return }
    if (formData.evaluatorId === formData.evaluateeId && formData.relationshipType !== 'SELF') { toast.error('Cannot evaluate self (unless self-evaluation)'); return }
    setSaving(true)
    try {
      if (editingMapping) {
        // Delete old mapping and create new one
        await fetch(`/api/admin/mappings?id=${editingMapping.id}`, { method: 'DELETE' })
      }
      const res = await fetch('/api/admin/mappings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) })
      const data = await res.json()
      if (data.error) toast.error(data.error)
      else { toast.success(editingMapping ? 'Mapping updated' : 'Mapping created'); setIsModalOpen(false); setEditingMapping(null); loadData() }
    } catch { toast.error('Failed to save mapping') }
    finally { setSaving(false) }
  }

  const handleEdit = (mapping: Mapping) => {
    setEditingMapping(mapping)
    setFormData({
      evaluatorId: mapping.evaluatorId,
      evaluateeId: mapping.evaluateeId,
      relationshipType: mapping.relationshipType
    })
    setIsModalOpen(true)
  }

  const handleDelete = async () => {
    if (!mappingToDelete) return
    try {
      const res = await fetch(`/api/admin/mappings?id=${mappingToDelete.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.error) toast.error(data.error)
      else { toast.success('Mapping deleted'); loadData() }
    } catch { toast.error('Failed to delete') }
    finally { setIsDeleteDialogOpen(false); setMappingToDelete(null) }
  }

  const handleClearAll = async () => {
    try {
      // The import endpoint with clearExisting will handle this
      setIsClearDialogOpen(false)
      toast.success('Mappings will be cleared during import')
    } catch { toast.error('Failed to clear mappings') }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const lowerName = file.name.toLowerCase()
    setImportFileName(file.name)

    if (lowerName.endsWith('.xlsx')) {
      setWorkbookFile(file)
      setImportFormat('q4')
      setImportData([])
      setImportPreview([])
      return
    }

    setWorkbookFile(null)
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as any[]
        setImportData(data)
        setImportPreview(data.slice(0, 5))
        
        // Auto-detect format
        if (data.length > 0) {
          const firstRow = data[0]
          if ('Team Lead 1' in firstRow || 'Name' in firstRow && 'Designation' in firstRow) {
            setImportFormat('q4')
          } else {
            setImportFormat('simple')
          }
        }
      },
      error: () => toast.error('Failed to parse CSV'),
    })
  }

  const handleImport = async () => {
    const hasWorkbook = Boolean(workbookFile)
    if (!hasWorkbook && importData.length === 0) { toast.error('No data to import'); return }
    setImporting(true)
    try {
      let res
      if (importFormat === 'q4') {
        if (workbookFile) {
          const formData = new FormData()
          formData.append('file', workbookFile)
          formData.append('clearExisting', String(clearBeforeImport))
          res = await fetch('/api/admin/import-mappings', {
            method: 'POST',
            body: formData,
          })
        } else {
          // Use legacy JSON import for CSV-based sheet rows
          res = await fetch('/api/admin/import-mappings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rows: importData, clearExisting: clearBeforeImport })
          })
        }
      } else {
        // Use old simple format
        res = await fetch('/api/admin/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'mappings', data: importData })
        })
      }
      
      const data = await res.json()
      if (data.error) {
        toast.error(data.error)
      } else {
        const result = data.result || data
        toast.success(`Import complete: ${result.mappingsCreated || result.created || 0} mappings created`)
        if (result.errors && result.errors.length > 0) {
          console.log('Import errors:', result.errors)
          toast.warning(`${result.errors.length} warnings - check console`)
        }
        const validation = result.validation as ImportValidation | undefined
        const warnings = result.warnings as ImportWarnings | undefined
        if (validation?.mismatchedProfiles?.length) {
          console.log('Workbook profile validation mismatches:', validation.mismatchedProfiles)
          toast.warning(`${validation.mismatchedProfiles.length} workbook profile mismatches detected`)
        }
        if ((warnings?.unmatchedCategorySets?.length || 0) > 0 || (warnings?.mismatchedEmployees?.length || 0) > 0) {
          console.log('Profile drift warnings:', warnings)
          toast.warning('Some mappings do not match a saved weight profile - check console')
        }
        setIsImportModalOpen(false)
        setImportData([])
        setImportPreview([])
        setWorkbookFile(null)
        setImportFileName('')
        loadData()
      }
    } catch (err) {
      console.error('Import error:', err)
      toast.error('Failed to import')
    }
    finally { setImporting(false) }
  }

  const relationshipTypes = Object.keys(RELATIONSHIP_TYPE_LABELS) as RelationshipType[]
  const allUsers = users
  const employees = users.filter(u => u.role === 'EMPLOYEE')
  
  const filteredMappings = mappings.filter(m => {
    const matchSearch = m.evaluator.name.toLowerCase().includes(searchTerm.toLowerCase()) || m.evaluatee.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchType = filterType === 'all' || m.relationshipType === filterType
    const matchEmployee = filterEmployee === 'all' || m.evaluateeId === filterEmployee || m.evaluatorId === filterEmployee
    return matchSearch && matchType && matchEmployee
  })

  if (loading) {
    return (
      <div className="p-6 sm:p-8 max-w-7xl mx-auto">
        <LoadingScreen message="Loading mappings..." />
      </div>
    )
  }

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground font-display">Evaluator Mappings</h1>
            <p className="text-muted-foreground mt-1">{mappings.length} mappings configured</p>
          </div>
          <div className="flex gap-3 mt-4 md:mt-0 flex-wrap">
            <Button variant="outline" asChild>
              <Link href="/admin/org-chart" className="flex items-center gap-2">
                <GitBranch className="w-4 h-4" /> Org Chart
              </Link>
            </Button>
            <Button variant="outline" onClick={() => setIsImportModalOpen(true)}>
              <Upload className="w-4 h-4" /> Import Workbook / CSV
            </Button>
            <Button onClick={() => { setEditingMapping(null); setFormData({ evaluatorId: '', evaluateeId: '', relationshipType: 'PEER' }); setIsModalOpen(true) }}>
              <Plus className="w-4 h-4" /> Add Mapping
            </Button>
          </div>
        </div>

        {/* Filters */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border bg-card p-4 mb-6">
          <div className="flex flex-wrap gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input type="text" placeholder="Search by name..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {relationshipTypes.map(t => <SelectItem key={t} value={t}>{RELATIONSHIP_TYPE_LABELS[t]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterEmployee} onValueChange={setFilterEmployee}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Employees" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {employees.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </motion.div>

        {/* Mappings List */}
        <div className="space-y-3">
          {filteredMappings.map((mapping, index) => (
            <motion.div key={mapping.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.02 * Math.min(index, 20) }}>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                        {mapping.evaluator.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-foreground truncate">{mapping.evaluator.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{mapping.evaluator.department || 'No dept'}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 px-3 flex-shrink-0">
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                      <Badge variant="secondary">{RELATIONSHIP_TYPE_LABELS[mapping.relationshipType]}</Badge>
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                        {mapping.evaluatee.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-foreground truncate">{mapping.evaluatee.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{mapping.evaluatee.department || 'No dept'}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(mapping)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => { setMappingToDelete(mapping); setIsDeleteDialogOpen(true) }} className="text-destructive hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {filteredMappings.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Card>
              <CardContent className="p-12 text-center">
                <Link2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No mappings found</p>
              </CardContent>
            </Card>
          </motion.div>
        )}

      {/* Add/Edit Modal */}
      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingMapping(null) }} title={editingMapping ? 'Edit Mapping' : 'Add Mapping'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Evaluator (Who evaluates)</Label>
            <Select value={formData.evaluatorId} onValueChange={(v) => setFormData({ ...formData, evaluatorId: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Select evaluator..." />
              </SelectTrigger>
              <SelectContent>
                {allUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.name} {u.department ? `(${u.department})` : ''}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Relationship Type</Label>
            <Select value={formData.relationshipType} onValueChange={(v) => setFormData({ ...formData, relationshipType: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {relationshipTypes.map(t => <SelectItem key={t} value={t}>{RELATIONSHIP_TYPE_LABELS[t]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Evaluatee (Who is evaluated)</Label>
            <Select value={formData.evaluateeId} onValueChange={(v) => setFormData({ ...formData, evaluateeId: v })}>
              <SelectTrigger>
                <SelectValue placeholder="Select evaluatee..." />
              </SelectTrigger>
              <SelectContent>
                {allUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.name} {u.department ? `(${u.department})` : ''}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => { setIsModalOpen(false); setEditingMapping(null) }}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </div>
        </form>
      </Modal>

      {/* Import Modal */}
      <Modal isOpen={isImportModalOpen} onClose={() => { setIsImportModalOpen(false); setImportData([]); setImportPreview([]); setWorkbookFile(null); setImportFileName('') }} title="Import Mappings" size="lg">
        <div className="space-y-4">
          {/* Format Selection */}
          <div className="flex gap-4 p-4 bg-muted rounded-lg">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={importFormat === 'q4'} onChange={() => setImportFormat('q4')} className="w-4 h-4 text-primary" />
              <span className="text-foreground">Workbook / Sheet Format (Sheet1 mappings, Sheet2 profiles)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={importFormat === 'simple'} onChange={() => setImportFormat('simple')} className="w-4 h-4 text-primary" />
              <span className="text-foreground">Simple Format (evaluator, evaluatee, type)</span>
            </label>
          </div>

          {/* Clear existing option */}
          <label className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg cursor-pointer">
            <input type="checkbox" checked={clearBeforeImport} onChange={(e) => setClearBeforeImport(e.target.checked)} className="w-4 h-4 text-amber-600 rounded" />
            <div>
              <span className="text-foreground font-medium">Clear existing mappings before import</span>
              <p className="text-xs text-muted-foreground">This will delete all current mappings and replace with imported data</p>
            </div>
          </label>

          <div className="border-2 border-dashed border-input rounded-lg p-8 text-center">
            <input type="file" accept=".xlsx,.csv" onChange={handleFileUpload} className="hidden" id="csv-upload" />
            <label htmlFor="csv-upload" className="cursor-pointer">
              <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-foreground font-medium">Click to upload workbook or CSV</p>
              {importFormat === 'q4' ? (
                <p className="text-sm text-muted-foreground mt-1">Expected workbook: Sheet1 for mappings, Sheet2 for profiles. CSV is still supported for legacy row imports.</p>
              ) : (
                <p className="text-sm text-muted-foreground mt-1">Expected: evaluator_name, evaluatee_name, relationship_type</p>
              )}
              {importFileName && (
                <p className="text-xs text-muted-foreground mt-2">Selected: {importFileName}</p>
              )}
            </label>
          </div>

          {workbookFile && (
            <div className="bg-muted rounded-lg p-4 text-sm">
              <p className="font-medium text-foreground">Workbook ready</p>
              <p className="text-muted-foreground mt-1">
                Sheet1 will replace/import the mapping graph, Sheet2 will upsert the 9 workbook profiles,
                and the import will validate the expected members against the mapping-derived category sets.
              </p>
            </div>
          )}

          {importPreview.length > 0 && (
            <div className="bg-muted rounded-lg p-4">
              <p className="text-sm font-medium text-foreground mb-2">Preview ({importData.length} rows)</p>
              <div className="relative">
              <ProgressiveBlur position="bottom" height={24} />
              <div className="overflow-x-auto text-xs max-h-48 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {Object.keys(importPreview[0]).slice(0, 6).map(key => (
                        <TableHead key={key} className="py-1 px-2">{key}</TableHead>
                      ))}
                      {Object.keys(importPreview[0]).length > 6 && <TableHead className="py-1 px-2">...</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importPreview.map((row, i) => (
                      <TableRow key={i}>
                        {Object.values(row).slice(0, 6).map((val, j) => (
                          <TableCell key={j} className="py-1 px-2 truncate max-w-[150px]">{String(val) || '-'}</TableCell>
                        ))}
                        {Object.keys(row).length > 6 && <TableCell className="py-1 px-2">...</TableCell>}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              </div>
            </div>
          )}

          {importFormat === 'q4' && importData.length > 0 && (
            <div className="flex items-start gap-2 p-3 bg-primary/10 border border-primary/20 rounded-lg">
              <AlertCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="text-sm text-foreground">
                <p className="font-medium">Workbook Mapping Rules</p>
                <p className="text-muted-foreground">Team Lead columns become Team Lead except Hamiz, who maps to the Hamiz/C-Level bucket. Reporting Team Members become Direct Reports, HR and Dept constants are synced automatically, and Hamiz, Daniyal, Brad, Maryam, and Richard do not receive incoming evaluators.</p>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => { setIsImportModalOpen(false); setImportData([]); setImportPreview([]); setWorkbookFile(null); setImportFileName('') }}>Cancel</Button>
            <Button onClick={handleImport} disabled={importing || (!workbookFile && importData.length === 0)}>
              {importing ? 'Importing...' : workbookFile ? 'Import Workbook' : `Import ${importData.length} Rows`}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog isOpen={isDeleteDialogOpen} onClose={() => setIsDeleteDialogOpen(false)} onConfirm={handleDelete} title="Delete Mapping" message="Are you sure you want to delete this mapping?" confirmText="Delete" variant="danger" />
      <ConfirmDialog isOpen={isClearDialogOpen} onClose={() => setIsClearDialogOpen(false)} onConfirm={handleClearAll} title="Clear All Mappings" message="This will delete ALL existing mappings. This action cannot be undone." confirmText="Clear All" variant="danger" />
    </div>
  )
}

