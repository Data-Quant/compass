'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
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
import Papa from 'papaparse'
import { Users, Plus, Search, Upload, Edit2, Trash2, UserCheck, Shield, Key, Eye, EyeOff } from 'lucide-react'

const MotionTableRow = motion(TableRow)

interface User {
  id: string
  name: string
  email: string | null
  department: string | null
  position: string | null
  role: 'EMPLOYEE' | 'HR' | 'SECURITY' | 'OA'
  createdAt: string
}

export default function UsersPage() {
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

  useEffect(() => { loadUsers() }, [])

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
      <div className="p-6 sm:p-8 max-w-7xl mx-auto">
        <LoadingScreen message="Loading users..." />
      </div>
    )
  }

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground font-display">User Management</h1>
            <p className="text-muted-foreground mt-1">{users.length} users total</p>
          </div>
          <div className="flex gap-3 mt-4 md:mt-0">
            <Button variant="outline" onClick={() => setIsImportModalOpen(true)}>
              <Upload className="w-4 h-4" /> Import CSV
            </Button>
            <Button onClick={() => handleOpenModal()}>
              <Plus className="w-4 h-4" /> Add User
            </Button>
          </div>
        </div>

        {/* Filters */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-4">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search users..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={filterRole || '__all__'} onValueChange={(v) => setFilterRole(v === '__all__' ? '' : v)}>
                  <SelectTrigger className="min-w-[140px]">
                    <SelectValue placeholder="All Roles" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Roles</SelectItem>
                    <SelectItem value="EMPLOYEE">Employee</SelectItem>
                    <SelectItem value="HR">HR</SelectItem>
                    <SelectItem value="SECURITY">Security</SelectItem>
                    <SelectItem value="OA">O&amp;A</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterDepartment || '__all__'} onValueChange={(v) => setFilterDepartment(v === '__all__' ? '' : v)}>
                  <SelectTrigger className="min-w-[140px]">
                    <SelectValue placeholder="All Departments" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All Departments</SelectItem>
                    {departments.map(d => <SelectItem key={d} value={d!}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Users Table */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="overflow-hidden">
            {filteredUsers.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="px-6 py-4">User</TableHead>
                  <TableHead className="px-6 py-4">Email</TableHead>
                  <TableHead className="px-6 py-4">Department</TableHead>
                  <TableHead className="px-6 py-4">Role</TableHead>
                  <TableHead className="px-6 py-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user, index) => (
                  <MotionTableRow key={user.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.02 * index }} className="border-b transition-colors hover:bg-muted/50">
                    <TableCell className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-sm font-medium">
                          {user.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <div className="font-medium text-foreground">{user.name}</div>
                          {user.position && <div className="text-xs text-muted-foreground">{user.position}</div>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="px-6 py-4 text-sm text-muted-foreground">{user.email || '—'}</TableCell>
                    <TableCell className="px-6 py-4 text-sm text-muted-foreground">{user.department || '—'}</TableCell>
                    <TableCell className="px-6 py-4">
                      <Badge
                        variant={user.role === 'HR' || user.role === 'OA' ? 'default' : 'secondary'}
                        className={
                          user.role === 'HR'
                            ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-0'
                            : user.role === 'OA'
                              ? 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-0'
                            : user.role === 'SECURITY'
                              ? 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-0'
                              : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-0'
                        }
                      >
                        {user.role === 'EMPLOYEE' ? <UserCheck className="w-3 h-3" /> : <Shield className="w-3 h-3" />}
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-6 py-4">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleOpenPasswordModal(user)} title="Set Password" className="text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10">
                          <Key className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleOpenModal(user)} title="Edit User" className="text-muted-foreground hover:text-foreground hover:bg-muted">
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => { setUserToDelete(user); setIsDeleteDialogOpen(true) }} title="Delete User" className="text-muted-foreground hover:text-red-500 hover:bg-red-500/10">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </MotionTableRow>
                ))}
              </TableBody>
            </Table>
            ) : (
              <div className="p-12 text-center">
                <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No users found</p>
              </div>
            )}
          </Card>
        </motion.div>

      {/* Add/Edit Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={selectedUser ? 'Edit User' : 'Add User'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name" className="mb-1">Name *</Label>
            <Input id="name" type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="email" className="mb-1">Email</Label>
            <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="department" className="mb-1">Department</Label>
              <Input id="department" type="text" value={formData.department} onChange={(e) => setFormData({ ...formData, department: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="position" className="mb-1">Position</Label>
              <Input id="position" type="text" value={formData.position} onChange={(e) => setFormData({ ...formData, position: e.target.value })} />
            </div>
          </div>
          <div>
            <Label htmlFor="role" className="mb-1">Role</Label>
            <Select value={formData.role} onValueChange={(v) => setFormData({ ...formData, role: v })}>
              <SelectTrigger id="role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EMPLOYEE">Employee</SelectItem>
                <SelectItem value="HR">HR</SelectItem>
                <SelectItem value="SECURITY">Security</SelectItem>
                <SelectItem value="OA">O&amp;A</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </div>
        </form>
      </Modal>

      {/* Import Modal */}
      <Modal isOpen={isImportModalOpen} onClose={() => { setIsImportModalOpen(false); setImportData([]); setImportPreview([]) }} title="Import Users from CSV">
        <div className="space-y-4">
          <div className="border-2 border-dashed border-input rounded-lg p-8 text-center">
            <Input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" id="csv-upload" />
            <Label htmlFor="csv-upload" className="cursor-pointer block">
              <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2 block" />
              <p className="text-foreground font-medium">Click to upload CSV</p>
              <p className="text-sm text-muted-foreground mt-1">Columns: name, email, department, position, role</p>
            </Label>
          </div>
          {importPreview.length > 0 && (
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-medium text-foreground mb-2">Preview ({importData.length} rows)</p>
                <div className="overflow-x-auto text-xs">
                  <Table>
                    <TableBody>
                      {importPreview.map((row, i) => (
                        <TableRow key={i}>
                          <TableCell className="py-1 text-muted-foreground">{row.name}</TableCell>
                          <TableCell className="py-1 text-muted-foreground">{row.email}</TableCell>
                          <TableCell className="py-1 text-muted-foreground">{row.department}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => { setIsImportModalOpen(false); setImportData([]); setImportPreview([]) }}>Cancel</Button>
            <Button onClick={handleImport} disabled={importing || importData.length === 0}>{importing ? 'Importing...' : `Import ${importData.length} Users`}</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog isOpen={isDeleteDialogOpen} onClose={() => setIsDeleteDialogOpen(false)} onConfirm={handleDelete} title="Delete User" message={`Are you sure you want to delete ${userToDelete?.name}?`} confirmText="Delete" variant="danger" />

      {/* Password Modal */}
      <Modal isOpen={isPasswordModalOpen} onClose={() => setIsPasswordModalOpen(false)} title="Set Password">
        {passwordUser && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-sm font-medium">
                {passwordUser.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
              <div>
                <div className="font-medium text-foreground">{passwordUser.name}</div>
                <div className="text-sm text-muted-foreground">{passwordUser.email || 'No email'}</div>
              </div>
            </div>

            <div>
              <Label htmlFor="new-password" className="mb-1">New Password</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password (min 6 characters)"
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground hover:bg-transparent h-8 w-8"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">This will set or reset the user's password.</p>
            </div>

            <div className="flex justify-between pt-4">
              <Button
                variant="ghost"
                onClick={handleRemovePassword}
                className="text-red-600 hover:bg-red-500/10 hover:text-red-600"
              >
                Remove Password
              </Button>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setIsPasswordModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSetPassword}
                  disabled={settingPassword || newPassword.length < 6}
                >
                  {settingPassword ? 'Setting...' : 'Set Password'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

