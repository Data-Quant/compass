'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PageHeader } from '@/components/layout/page-header'
import { PageFooter } from '@/components/layout/page-footer'
import { PageContainer, PageContent } from '@/components/layout/page-container'
import { RELATIONSHIP_TYPE_LABELS, RelationshipType } from '@/types'
import Papa from 'papaparse'
import { Link2, Plus, Upload, Search, Trash2, ArrowRight, Users } from 'lucide-react'

interface Mapping {
  id: string; evaluatorId: string; evaluateeId: string; relationshipType: RelationshipType
  evaluator: { id: string; name: string; department: string | null }
  evaluatee: { id: string; name: string; department: string | null }
}

interface User { id: string; name: string; department: string | null; role: string }

export default function MappingsPage() {
  const router = useRouter()
  const [mappings, setMappings] = useState<Mapping[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<string>('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [mappingToDelete, setMappingToDelete] = useState<Mapping | null>(null)
  const [formData, setFormData] = useState({ evaluatorId: '', evaluateeId: '', relationshipType: 'PEER' })
  const [saving, setSaving] = useState(false)
  const [importData, setImportData] = useState<any[]>([])
  const [importPreview, setImportPreview] = useState<any[]>([])
  const [importing, setImporting] = useState(false)

  useEffect(() => { checkAuth() }, [])

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/session')
      const data = await res.json()
      if (!data.user || data.user.role !== 'HR') { router.push('/login'); return }
      loadData()
    } catch { router.push('/login') }
  }

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
      const res = await fetch('/api/admin/mappings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) })
      const data = await res.json()
      if (data.error) toast.error(data.error)
      else { toast.success('Mapping created'); setIsModalOpen(false); loadData() }
    } catch { toast.error('Failed to create mapping') }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!mappingToDelete) return
    try {
      const res = await fetch('/api/admin/mappings', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: mappingToDelete.id }) })
      const data = await res.json()
      if (data.error) toast.error(data.error)
      else { toast.success('Mapping deleted'); loadData() }
    } catch { toast.error('Failed to delete') }
    finally { setIsDeleteDialogOpen(false); setMappingToDelete(null) }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => { setImportData(results.data); setImportPreview(results.data.slice(0, 5)) },
      error: () => toast.error('Failed to parse CSV'),
    })
  }

  const handleImport = async () => {
    if (importData.length === 0) { toast.error('No data to import'); return }
    setImporting(true)
    try {
      const res = await fetch('/api/admin/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'mappings', data: importData }) })
      const data = await res.json()
      if (data.error) toast.error(data.error)
      else { toast.success(`Imported ${data.created} mappings`); setIsImportModalOpen(false); setImportData([]); setImportPreview([]); loadData() }
    } catch { toast.error('Failed to import') }
    finally { setImporting(false) }
  }

  const relationshipTypes = Object.keys(RELATIONSHIP_TYPE_LABELS) as RelationshipType[]
  const employees = users.filter(u => u.role !== 'HR')
  
  const filteredMappings = mappings.filter(m => {
    const matchSearch = m.evaluator.name.toLowerCase().includes(searchTerm.toLowerCase()) || m.evaluatee.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchType = !filterType || m.relationshipType === filterType
    return matchSearch && matchType
  })

  if (loading) {
    return (
      <PageContainer>
        <div className="min-h-screen flex items-center justify-center">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full gradient-primary animate-pulse" />
            <p className="text-muted text-sm">Loading mappings...</p>
          </motion.div>
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader backHref="/admin" backLabel="Back to Admin" badge="Mappings" />
      
      <PageContent>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Evaluator Mappings</h1>
            <p className="text-muted mt-1">{mappings.length} mappings configured</p>
          </div>
          <div className="flex gap-3 mt-4 md:mt-0">
            <button onClick={() => setIsImportModalOpen(true)} className="flex items-center gap-2 px-4 py-2.5 border border-border rounded-lg hover:bg-surface text-foreground transition-colors">
              <Upload className="w-4 h-4" /> Import CSV
            </button>
            <button onClick={() => { setFormData({ evaluatorId: '', evaluateeId: '', relationshipType: 'PEER' }); setIsModalOpen(true) }} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
              <Plus className="w-4 h-4" /> Add Mapping
            </button>
          </div>
        </div>

        {/* Filters */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-xl p-4 mb-6">
          <div className="flex flex-wrap gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input type="text" placeholder="Search by name..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-surface border border-border rounded-lg text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
            </div>
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="px-4 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50">
              <option value="">All Types</option>
              {relationshipTypes.map(t => <option key={t} value={t}>{RELATIONSHIP_TYPE_LABELS[t]}</option>)}
            </select>
          </div>
        </motion.div>

        {/* Mappings List */}
        <div className="space-y-3">
          {filteredMappings.map((mapping, index) => (
            <motion.div key={mapping.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.02 * index }} className="glass rounded-xl p-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 flex-1">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-sm font-medium">
                    {mapping.evaluator.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div>
                    <div className="font-medium text-foreground">{mapping.evaluator.name}</div>
                    <div className="text-xs text-muted">{mapping.evaluator.department || 'No dept'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 px-3">
                  <ArrowRight className="w-4 h-4 text-muted" />
                  <span className="px-2 py-1 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded text-xs font-medium">
                    {RELATIONSHIP_TYPE_LABELS[mapping.relationshipType]}
                  </span>
                  <ArrowRight className="w-4 h-4 text-muted" />
                </div>
                <div className="flex items-center gap-3 flex-1">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white text-sm font-medium">
                    {mapping.evaluatee.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                  </div>
                  <div>
                    <div className="font-medium text-foreground">{mapping.evaluatee.name}</div>
                    <div className="text-xs text-muted">{mapping.evaluatee.department || 'No dept'}</div>
                  </div>
                </div>
                <button onClick={() => { setMappingToDelete(mapping); setIsDeleteDialogOpen(true) }} className="p-2 text-muted hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
            </motion.div>
          ))}
        </div>

        {filteredMappings.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass rounded-xl p-12 text-center">
            <Link2 className="w-12 h-12 text-muted mx-auto mb-4" />
            <p className="text-muted">No mappings found</p>
          </motion.div>
        )}

        <PageFooter />
      </PageContent>

      {/* Add Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Add Mapping">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Evaluator (Who evaluates)</label>
            <select value={formData.evaluatorId} onChange={(e) => setFormData({ ...formData, evaluatorId: e.target.value })} className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50">
              <option value="">Select evaluator...</option>
              {employees.map(u => <option key={u.id} value={u.id}>{u.name} {u.department ? `(${u.department})` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Relationship Type</label>
            <select value={formData.relationshipType} onChange={(e) => setFormData({ ...formData, relationshipType: e.target.value })} className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50">
              {relationshipTypes.map(t => <option key={t} value={t}>{RELATIONSHIP_TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Evaluatee (Who is evaluated)</label>
            <select value={formData.evaluateeId} onChange={(e) => setFormData({ ...formData, evaluateeId: e.target.value })} className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50">
              <option value="">Select evaluatee...</option>
              {employees.map(u => <option key={u.id} value={u.id}>{u.name} {u.department ? `(${u.department})` : ''}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 border border-border rounded-lg hover:bg-surface text-foreground transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      {/* Import Modal */}
      <Modal isOpen={isImportModalOpen} onClose={() => { setIsImportModalOpen(false); setImportData([]); setImportPreview([]) }} title="Import Mappings from CSV">
        <div className="space-y-4">
          <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
            <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" id="csv-upload" />
            <label htmlFor="csv-upload" className="cursor-pointer">
              <Upload className="w-8 h-8 text-muted mx-auto mb-2" />
              <p className="text-foreground font-medium">Click to upload CSV</p>
              <p className="text-sm text-muted mt-1">Columns: evaluator_name, evaluatee_name, relationship_type</p>
            </label>
          </div>
          {importPreview.length > 0 && (
            <div className="bg-surface rounded-lg p-4">
              <p className="text-sm font-medium text-foreground mb-2">Preview ({importData.length} rows)</p>
              <div className="overflow-x-auto text-xs">
                <table className="w-full"><tbody>
                  {importPreview.map((row, i) => <tr key={i} className="border-b border-border"><td className="py-1 text-muted">{row.evaluator_name || row.evaluator}</td><td className="py-1 text-muted">→</td><td className="py-1 text-muted">{row.evaluatee_name || row.evaluatee}</td></tr>)}
                </tbody></table>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button onClick={() => { setIsImportModalOpen(false); setImportData([]); setImportPreview([]) }} className="px-4 py-2 border border-border rounded-lg hover:bg-surface text-foreground transition-colors">Cancel</button>
            <button onClick={handleImport} disabled={importing || importData.length === 0} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">{importing ? 'Importing...' : `Import ${importData.length} Mappings`}</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog isOpen={isDeleteDialogOpen} onClose={() => setIsDeleteDialogOpen(false)} onConfirm={handleDelete} title="Delete Mapping" message="Are you sure you want to delete this mapping?" confirmText="Delete" variant="danger" />
    </PageContainer>
  )
}
