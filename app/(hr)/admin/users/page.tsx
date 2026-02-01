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
import Papa from 'papaparse'
import { Users, Plus, Search, Upload, Edit2, Trash2, UserCheck, Shield, Key, Eye, EyeOff } from 'lucide-react'

interface User {
  id: string
  name: string
  email: string | null
  department: string | null
  position: string | null
  role: 'EMPLOYEE' | 'HR'
  createdAt: string
}

export default function UsersPage() {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterRole, setFilterRole] = useState<string>('')
  const [filterDepartment, setFilterDepartment] = useState<string>('')
  
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [userToDelete, setUserToDelete] = useState<User | null>(null)
  
  const [formData, setFormData] = useState({ name: '', email: '', department: '', position: '', role: 'EMPLOYEE' })
  const [saving, setSaving] = useState(false)
  const [importData, setImportData] = useState<any[]>([])
  const [importPreview, setImportPreview] = useState<any[]>([])
  const [importing, setImporting] = useState(false)
  
  // Password management
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false)
  const [passwordUser, setPasswordUser] = useState<User | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [settingPassword, setSettingPassword] = useState(false)

  useEffect(() => { checkAuth() }, [])

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/session')
      const data = await res.json()
      if (!data.user || data.user.role !== 'HR') { router.push('/login'); return }
      loadUsers()
    } catch (error) { router.push('/login') }
  }

  const loadUsers = async () => {
    try {
      const res = await fetch('/api/admin/users')
      const data = await res.json()
      setUsers(data.users || [])
    } catch (error) { toast.error('Failed to load users') }
    finally { setLoading(false) }
  }

  const handleOpenModal = (user?: User) => {
    if (user) {
      setSelectedUser(user)
      setFormData({ name: user.name, email: user.email || '', department: user.department || '', position: user.position || '', role: user.role })
    } else {
      setSelectedUser(null)
      setFormData({ name: '', email: '', department: '', position: '', role: 'EMPLOYEE' })
    }
    setIsModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      const url = '/api/admin/users'
      const method = selectedUser ? 'PUT' : 'POST'
      const body = selectedUser ? { ...formData, id: selectedUser.id } : formData
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (data.error) { toast.error(data.error) } 
      else { toast.success(selectedUser ? 'User updated' : 'User created'); setIsModalOpen(false); loadUsers() }
    } catch (error) { toast.error('Failed to save user') }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!userToDelete) return
    try {
      const res = await fetch('/api/admin/users', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: userToDelete.id }) })
      const data = await res.json()
      if (data.error) { toast.error(data.error) } 
      else { toast.success('User deleted'); loadUsers() }
    } catch (error) { toast.error('Failed to delete user') }
    finally { setIsDeleteDialogOpen(false); setUserToDelete(null) }
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setImportData(results.data)
        setImportPreview(results.data.slice(0, 5))
      },
      error: () => toast.error('Failed to parse CSV file'),
    })
  }

  const handleImport = async () => {
    if (importData.length === 0) { toast.error('No data to import'); return }
    setImporting(true)
    try {
      const res = await fetch('/api/admin/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'users', data: importData }) })
      const data = await res.json()
      if (data.error) { toast.error(data.error) } 
      else { toast.success(`Imported ${data.created} users, updated ${data.updated}`); setIsImportModalOpen(false); setImportData([]); setImportPreview([]); loadUsers() }
    } catch (error) { toast.error('Failed to import users') }
    finally { setImporting(false) }
  }

  const handleOpenPasswordModal = (user: User) => {
    setPasswordUser(user)
    setNewPassword('')
    setShowPassword(false)
    setIsPasswordModalOpen(true)
  }

  const handleSetPassword = async () => {
    if (!passwordUser || !newPassword) return
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    setSettingPassword(true)
    try {
      const res = await fetch('/api/admin/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: passwordUser.id, password: newPassword }),
      })
      const data = await res.json()
      if (data.error) {
        toast.error(data.error)
      } else {
        toast.success(`Password set for ${passwordUser.name}`)
        setIsPasswordModalOpen(false)
      }
    } catch (error) {
      toast.error('Failed to set password')
    } finally {
      setSettingPassword(false)
    }
  }

  const handleRemovePassword = async () => {
    if (!passwordUser) return
    if (!confirm(`Remove password for ${passwordUser.name}? They will be able to log in without a password.`)) return
    try {
      const res = await fetch(`/api/admin/password?userId=${passwordUser.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.error) {
        toast.error(data.error)
      } else {
        toast.success('Password removed')
        setIsPasswordModalOpen(false)
      }
    } catch (error) {
      toast.error('Failed to remove password')
    }
  }

  const departments = [...new Set(users.map(u => u.department).filter(Boolean))]
  const filteredUsers = users.filter(u => {
    const matchSearch = u.name.toLowerCase().includes(searchTerm.toLowerCase()) || u.email?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchRole = !filterRole || u.role === filterRole
    const matchDept = !filterDepartment || u.department === filterDepartment
    return matchSearch && matchRole && matchDept
  })

  if (loading) {
    return (
      <PageContainer>
        <div className="min-h-screen flex items-center justify-center">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full gradient-primary animate-pulse" />
            <p className="text-muted text-sm">Loading users...</p>
          </motion.div>
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader backHref="/admin" backLabel="Back to Admin" badge="Users" />
      
      <PageContent>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">User Management</h1>
            <p className="text-muted mt-1">{users.length} users total</p>
          </div>
          <div className="flex gap-3 mt-4 md:mt-0">
            <button onClick={() => setIsImportModalOpen(true)} className="flex items-center gap-2 px-4 py-2.5 border border-border rounded-lg hover:bg-surface text-foreground transition-colors">
              <Upload className="w-4 h-4" /> Import CSV
            </button>
            <button onClick={() => handleOpenModal()} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
              <Plus className="w-4 h-4" /> Add User
            </button>
          </div>
        </div>

        {/* Filters */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-xl p-4 mb-6">
          <div className="flex flex-wrap gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input type="text" placeholder="Search users..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-surface border border-border rounded-lg text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
            </div>
            <select value={filterRole} onChange={(e) => setFilterRole(e.target.value)} className="px-4 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50">
              <option value="">All Roles</option>
              <option value="EMPLOYEE">Employee</option>
              <option value="HR">HR</option>
            </select>
            <select value={filterDepartment} onChange={(e) => setFilterDepartment(e.target.value)} className="px-4 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50">
              <option value="">All Departments</option>
              {departments.map(d => <option key={d} value={d!}>{d}</option>)}
            </select>
          </div>
        </motion.div>

        {/* Users Table */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface border-b border-border">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-muted uppercase">User</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-muted uppercase">Email</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-muted uppercase">Department</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-muted uppercase">Role</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-muted uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredUsers.map((user, index) => (
                  <motion.tr key={user.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.02 * index }} className="hover:bg-surface/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-sm font-medium">
                          {user.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <div className="font-medium text-foreground">{user.name}</div>
                          {user.position && <div className="text-xs text-muted">{user.position}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted">{user.email || '—'}</td>
                    <td className="px-6 py-4 text-sm text-muted">{user.department || '—'}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${user.role === 'HR' ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400' : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'}`}>
                        {user.role === 'HR' ? <Shield className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleOpenPasswordModal(user)} title="Set Password" className="p-2 text-muted hover:text-amber-500 hover:bg-amber-500/10 rounded-lg transition-colors"><Key className="w-4 h-4" /></button>
                        <button onClick={() => handleOpenModal(user)} title="Edit User" className="p-2 text-muted hover:text-foreground hover:bg-surface rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => { setUserToDelete(user); setIsDeleteDialogOpen(true) }} title="Delete User" className="p-2 text-muted hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredUsers.length === 0 && (
            <div className="p-12 text-center">
              <Users className="w-12 h-12 text-muted mx-auto mb-4" />
              <p className="text-muted">No users found</p>
            </div>
          )}
        </motion.div>

        <PageFooter />
      </PageContent>

      {/* Add/Edit Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={selectedUser ? 'Edit User' : 'Add User'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Name *</label>
            <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Email</label>
            <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Department</label>
              <input type="text" value={formData.department} onChange={(e) => setFormData({ ...formData, department: e.target.value })} className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Position</label>
              <input type="text" value={formData.position} onChange={(e) => setFormData({ ...formData, position: e.target.value })} className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Role</label>
            <select value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })} className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50">
              <option value="EMPLOYEE">Employee</option>
              <option value="HR">HR</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 border border-border rounded-lg hover:bg-surface text-foreground transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      {/* Import Modal */}
      <Modal isOpen={isImportModalOpen} onClose={() => { setIsImportModalOpen(false); setImportData([]); setImportPreview([]) }} title="Import Users from CSV">
        <div className="space-y-4">
          <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
            <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" id="csv-upload" />
            <label htmlFor="csv-upload" className="cursor-pointer">
              <Upload className="w-8 h-8 text-muted mx-auto mb-2" />
              <p className="text-foreground font-medium">Click to upload CSV</p>
              <p className="text-sm text-muted mt-1">Columns: name, email, department, position, role</p>
            </label>
          </div>
          {importPreview.length > 0 && (
            <div className="bg-surface rounded-lg p-4">
              <p className="text-sm font-medium text-foreground mb-2">Preview ({importData.length} rows)</p>
              <div className="overflow-x-auto text-xs">
                <table className="w-full"><tbody>
                  {importPreview.map((row, i) => <tr key={i} className="border-b border-border"><td className="py-1 text-muted">{row.name}</td><td className="py-1 text-muted">{row.email}</td><td className="py-1 text-muted">{row.department}</td></tr>)}
                </tbody></table>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button onClick={() => { setIsImportModalOpen(false); setImportData([]); setImportPreview([]) }} className="px-4 py-2 border border-border rounded-lg hover:bg-surface text-foreground transition-colors">Cancel</button>
            <button onClick={handleImport} disabled={importing || importData.length === 0} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">{importing ? 'Importing...' : `Import ${importData.length} Users`}</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog isOpen={isDeleteDialogOpen} onClose={() => setIsDeleteDialogOpen(false)} onConfirm={handleDelete} title="Delete User" message={`Are you sure you want to delete ${userToDelete?.name}?`} confirmText="Delete" variant="danger" />

      {/* Password Modal */}
      <Modal isOpen={isPasswordModalOpen} onClose={() => setIsPasswordModalOpen(false)} title="Set Password">
        {passwordUser && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-surface rounded-lg">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-sm font-medium">
                {passwordUser.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
              <div>
                <div className="font-medium text-foreground">{passwordUser.name}</div>
                <div className="text-sm text-muted">{passwordUser.email || 'No email'}</div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-1">New Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password (min 6 characters)"
                  className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500/50 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-muted mt-1">This will set or reset the user's password.</p>
            </div>

            <div className="flex justify-between pt-4">
              <button
                onClick={handleRemovePassword}
                className="px-4 py-2 text-red-600 hover:bg-red-500/10 rounded-lg transition-colors text-sm"
              >
                Remove Password
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsPasswordModalOpen(false)}
                  className="px-4 py-2 border border-border rounded-lg hover:bg-surface text-foreground transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSetPassword}
                  disabled={settingPassword || newPassword.length < 6}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                >
                  {settingPassword ? 'Setting...' : 'Set Password'}
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </PageContainer>
  )
}
