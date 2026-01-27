'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { PageHeader } from '@/components/layout/page-header'
import { PageFooter } from '@/components/layout/page-footer'
import { PageContainer, PageContent } from '@/components/layout/page-container'
import { RELATIONSHIP_TYPE_LABELS, RelationshipType } from '@/types'
import { Users, Link2, Trash2, ArrowUpRight, Save, Building2 } from 'lucide-react'
import { C_LEVEL_EVALUATORS, COMPANY_NAME } from '@/lib/config'

interface User {
  id: string
  name: string
  department: string | null
  position: string | null
  role: string
}

interface Mapping {
  id: string
  evaluatorId: string
  evaluateeId: string
  relationshipType: RelationshipType
  evaluator: User
  evaluatee: User
}

// Color schemes
const COLORS: Record<string, { bg: string; border: string; text: string; avatar: string }> = {
  green: { bg: '#DCFCE7', border: '#22C55E', text: '#14532D', avatar: '#22C55E' },
  pink: { bg: '#FCE7F3', border: '#EC4899', text: '#831843', avatar: '#EC4899' },
  blue: { bg: '#DBEAFE', border: '#3B82F6', text: '#1E3A8A', avatar: '#3B82F6' },
  purple: { bg: '#F3E8FF', border: '#A855F7', text: '#581C87', avatar: '#A855F7' },
  yellow: { bg: '#FEF9C3', border: '#EAB308', text: '#713F12', avatar: '#EAB308' },
  orange: { bg: '#FFEDD5', border: '#F97316', text: '#7C2D12', avatar: '#F97316' },
  red: { bg: '#FEE2E2', border: '#EF4444', text: '#7F1D1D', avatar: '#EF4444' },
  gray: { bg: '#F3F4F6', border: '#9CA3AF', text: '#374151', avatar: '#9CA3AF' },
}

const DEPT_COLORS: Record<string, keyof typeof COLORS> = {
  '1to1Plans': 'green',
  'Design': 'blue',
  'Product': 'blue',
  'Marketing': 'blue',
  'Software Engineering': 'blue',
  'Growth': 'purple',
  'Growth and strategy': 'purple',
  'IR': 'purple',
  'Research': 'purple',
  'Quantitative Engineering': 'yellow',
  'Technology': 'yellow',
  'SOA': 'yellow',
  'Operations': 'green',
  'Accounting and Operations': 'green',
  'Legal': 'green',
  'Finance and Accounting': 'green',
  'Human Resources': 'pink',
  'Operating Partner-Value Creation': 'red',
  'Operating Partner-Execution': 'orange',
  'Executive': 'green',
}

function getColorScheme(dept: string | null, name?: string): typeof COLORS.green {
  if (name) {
    const n = name.toLowerCase()
    if (n.includes('hamiz')) return COLORS.green
    if (n.includes('richard')) return COLORS.green
    if (n.includes('maryam')) return COLORS.pink
    if (n.includes('brad')) return COLORS.red
    if (n.includes('daniyal')) return COLORS.orange
  }
  const colorKey = DEPT_COLORS[dept || ''] || 'gray'
  return COLORS[colorKey]
}

// Card component
function EmployeeCard({ 
  user, 
  onClick, 
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  hasChildren = false 
}: { 
  user: User
  onClick: () => void
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onDrop: () => void
  hasChildren?: boolean
}) {
  const colors = getColorScheme(user.department, user.name)
  const initials = user.name.split(' ').map(n => n[0]).join('').slice(0, 2)
  const [isDragOver, setIsDragOver] = useState(false)
  
  return (
    <div
      className={`org-card ${hasChildren ? 'has-children' : ''} ${isDragOver ? 'drop-target' : ''}`}
      style={{ 
        backgroundColor: colors.bg, 
        borderColor: colors.border,
        boxShadow: isDragOver ? `0 0 0 3px ${colors.border}` : undefined
      }}
      onClick={onClick}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragOver={(e) => {
        e.preventDefault()
        setIsDragOver(true)
        onDragOver(e)
      }}
      onDragLeave={() => {
        setIsDragOver(false)
        onDragLeave()
      }}
      onDrop={(e) => {
        e.preventDefault()
        setIsDragOver(false)
        onDrop()
      }}
    >
      <div className="org-avatar" style={{ backgroundColor: colors.avatar }}>
        {initials}
      </div>
      <div className="org-name" style={{ color: colors.text }}>{user.name}</div>
      <div className="org-title" style={{ color: colors.text }}>{user.position || 'Employee'}</div>
    </div>
  )
}

// Tree branch component
function TreeBranch({ 
  children, 
  showConnector = true 
}: { 
  children: React.ReactNode
  showConnector?: boolean 
}) {
  return (
    <div className={`tree-branch ${showConnector ? 'with-connector' : ''}`}>
      {children}
    </div>
  )
}

// Tree children container
function TreeChildren({ 
  children, 
  count 
}: { 
  children: React.ReactNode
  count: number 
}) {
  return (
    <div className={`tree-children ${count > 1 ? 'multi' : ''}`}>
      {children}
    </div>
  )
}

export default function OrgChartPage() {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [mappings, setMappings] = useState<Mapping[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [isReassignModalOpen, setIsReassignModalOpen] = useState(false)
  const [draggedUser, setDraggedUser] = useState<User | null>(null)
  const [reassignData, setReassignData] = useState<{ employee: User | null; newManager: User | null; oldManager: User | null }>({ employee: null, newManager: null, oldManager: null })

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
      const [mappingsRes, usersRes] = await Promise.all([
        fetch('/api/admin/mappings'),
        fetch('/api/auth/login')
      ])
      const mappingsData = await mappingsRes.json()
      const usersData = await usersRes.json()
      setMappings(mappingsData.mappings || [])
      setUsers(usersData.users || [])
    } catch { toast.error('Failed to load data') }
    finally { setLoading(false) }
  }

  // Build tree structure from mappings
  const treeData = useMemo(() => {
    const parentOf = new Map<string, string>()
    const childrenOf = new Map<string, string[]>()
    
    mappings
      .filter(m => m.relationshipType === 'TEAM_LEAD' || m.relationshipType === 'C_LEVEL')
      .forEach(m => {
        if (!parentOf.has(m.evaluateeId)) {
          parentOf.set(m.evaluateeId, m.evaluatorId)
          if (!childrenOf.has(m.evaluatorId)) childrenOf.set(m.evaluatorId, [])
          childrenOf.get(m.evaluatorId)!.push(m.evaluateeId)
        }
      })
    
    // Find C-Level (roots)
    const cLevel = users.filter(u => 
      C_LEVEL_EVALUATORS.some(name => u.name.toLowerCase() === name.toLowerCase())
    )
    const hamiz = cLevel.find(u => u.name.toLowerCase().includes('hamiz'))
    const otherCLevel = cLevel.filter(u => u.id !== hamiz?.id)
    
    // Get children of a user
    const getChildren = (userId: string): User[] => {
      const childIds = childrenOf.get(userId) || []
      return childIds.map(id => users.find(u => u.id === id)).filter(Boolean) as User[]
    }
    
    // Debug logging
    if (hamiz) {
      const hamizChildren = getChildren(hamiz.id)
      console.log('Hamiz children:', hamizChildren.map(c => c.name))
      
      // Check if Muhammad Amir is in children
      const amir = hamizChildren.find(c => c.name.includes('Muhammad Amir'))
      if (amir) {
        console.log('Muhammad Amir children:', getChildren(amir.id).map(c => c.name))
      }
    }
    
    // Users not in the tree
    const inTree = new Set<string>()
    const markInTree = (userId: string) => {
      inTree.add(userId)
      getChildren(userId).forEach(child => markInTree(child.id))
    }
    if (hamiz) markInTree(hamiz.id)
    otherCLevel.forEach(u => markInTree(u.id))
    
    const unassigned = users.filter(u => !inTree.has(u.id))
    console.log('Unassigned count:', unassigned.length, unassigned.map(u => u.name).slice(0, 5))
    
    return { hamiz, otherCLevel, getChildren, parentOf, unassigned }
  }, [users, mappings])

  const handleCardClick = (user: User) => {
    setSelectedUser(user)
    setIsDetailModalOpen(true)
  }

  const handleDrop = (targetUser: User) => {
    if (!draggedUser || draggedUser.id === targetUser.id) return
    
    const currentMapping = mappings.find(m => 
      m.evaluateeId === draggedUser.id && 
      (m.relationshipType === 'TEAM_LEAD' || m.relationshipType === 'C_LEVEL')
    )
    
    if (currentMapping?.evaluatorId === targetUser.id) {
      toast.info('Already reports to this person')
      return
    }
    
    setReassignData({
      employee: draggedUser,
      newManager: targetUser,
      oldManager: currentMapping?.evaluator || null
    })
    setIsReassignModalOpen(true)
    setDraggedUser(null)
  }

  const handleReassign = async () => {
    if (!reassignData.employee || !reassignData.newManager) return
    try {
      toast.loading('Updating...')
      const isCLevel = C_LEVEL_EVALUATORS.some(n => reassignData.newManager!.name.toLowerCase() === n.toLowerCase())
      
      if (reassignData.oldManager) {
        const old = mappings.find(m => m.evaluateeId === reassignData.employee!.id && m.evaluatorId === reassignData.oldManager!.id)
        if (old) await fetch(`/api/admin/mappings?id=${old.id}`, { method: 'DELETE' })
      }
      
      await fetch('/api/admin/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          evaluatorId: reassignData.newManager.id, 
          evaluateeId: reassignData.employee.id, 
          relationshipType: isCLevel ? 'C_LEVEL' : 'TEAM_LEAD' 
        }),
      })
      
      toast.dismiss()
      toast.success('Updated!')
      setIsReassignModalOpen(false)
      loadData()
    } catch { toast.dismiss(); toast.error('Failed') }
  }

  const selectedUserMappings = useMemo(() => {
    if (!selectedUser) return { evaluators: [], evaluates: [] }
    return {
      evaluators: mappings.filter(m => m.evaluateeId === selectedUser.id),
      evaluates: mappings.filter(m => m.evaluatorId === selectedUser.id),
    }
  }, [selectedUser, mappings])

  const handleDeleteMapping = async (id: string) => {
    try {
      await fetch(`/api/admin/mappings?id=${id}`, { method: 'DELETE' })
      toast.success('Deleted')
      loadData()
    } catch { toast.error('Failed') }
  }

  // Render a user and their children recursively
  const renderTree = (user: User, depth = 0): React.ReactNode => {
    const children = treeData.getChildren(user.id)
    
    return (
      <div className="tree" key={user.id}>
        <TreeBranch showConnector={depth > 0}>
          <EmployeeCard
            user={user}
            onClick={() => handleCardClick(user)}
            onDragStart={() => setDraggedUser(user)}
            onDragOver={() => {}}
            onDragLeave={() => {}}
            onDrop={() => handleDrop(user)}
            hasChildren={children.length > 0}
          />
        </TreeBranch>
        {children.length > 0 && (
          <TreeChildren count={children.length}>
            {children.map(child => renderTree(child, depth + 1))}
          </TreeChildren>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <PageContainer>
        <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FDF6E3' }}>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-emerald-500 animate-pulse" />
            <p className="text-slate-600">Loading...</p>
          </motion.div>
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <style jsx global>{`
        .org-chart-container {
          background: #FDF6E3;
          min-height: calc(100vh - 140px);
          padding: 40px;
          overflow: auto;
        }
        
        .org-chart {
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        
        .company-card {
          background: white;
          border: 2px solid #E2E8F0;
          padding: 16px 28px;
          border-radius: 16px;
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 30px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.08);
        }
        
        .company-logo {
          width: 40px;
          height: 40px;
          background: linear-gradient(135deg, #22C55E, #16A34A);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .company-name {
          font-weight: 700;
          font-size: 18px;
          color: #1E293B;
        }
        
        .tree {
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        
        .tree-branch {
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        
        .tree-branch.with-connector::before {
          content: '';
          width: 2px;
          height: 25px;
          background: #94A3B8;
        }
        
        .tree-children {
          display: flex;
          justify-content: center;
          gap: 20px;
          padding-top: 25px;
          position: relative;
        }
        
        .tree-children::before {
          content: '';
          position: absolute;
          top: 0;
          left: 50%;
          width: 2px;
          height: 25px;
          background: #94A3B8;
          transform: translateX(-50%);
        }
        
        .tree-children.multi::after {
          content: '';
          position: absolute;
          top: 0;
          left: 50%;
          width: calc(100% - 130px);
          height: 2px;
          background: #94A3B8;
          transform: translateX(-50%);
        }
        
        .org-card {
          width: 130px;
          border-radius: 12px;
          border: 2px solid;
          padding: 12px 8px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s;
          background: white;
        }
        
        .org-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.12);
        }
        
        .org-card.has-children::after {
          content: '';
          display: block;
          width: 2px;
          height: 25px;
          background: #94A3B8;
          margin: 12px auto -37px;
        }
        
        .org-card.drop-target {
          transform: scale(1.05);
        }
        
        .org-avatar {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          margin: 0 auto 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 700;
          font-size: 14px;
        }
        
        .org-name {
          font-weight: 600;
          font-size: 11px;
          margin-bottom: 2px;
          line-height: 1.2;
        }
        
        .org-title {
          font-size: 9px;
          opacity: 0.75;
          line-height: 1.2;
        }
        
        .unassigned-section {
          margin-top: 60px;
          padding-top: 30px;
          border-top: 2px dashed #CBD5E1;
        }
        
        .unassigned-title {
          text-align: center;
          color: #64748B;
          font-size: 14px;
          margin-bottom: 20px;
        }
        
        .unassigned-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 15px;
          justify-content: center;
        }
      `}</style>
      
      <PageHeader backHref="/admin/mappings" backLabel="Mappings" badge="Org Chart" />
      
      <PageContent className="!max-w-none !px-0">
        <div className="org-chart-container">
          <div className="org-chart">
            {/* Company */}
            <div className="company-card">
              <div className="company-logo">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <span className="company-name">{COMPANY_NAME}</span>
            </div>
            
            {/* CEO and tree */}
            {treeData.hamiz && renderTree(treeData.hamiz)}
            
            {/* Other C-Level without Hamiz connection */}
            {treeData.otherCLevel.length > 0 && !treeData.hamiz && (
              <TreeChildren count={treeData.otherCLevel.length}>
                {treeData.otherCLevel.map(user => renderTree(user))}
              </TreeChildren>
            )}
            
            {/* Unassigned employees */}
            {treeData.unassigned.length > 0 && (
              <div className="unassigned-section">
                <div className="unassigned-title">
                  Unassigned Employees ({treeData.unassigned.length}) - Drag to a manager above
                </div>
                <div className="unassigned-grid">
                  {treeData.unassigned.map(user => (
                    <EmployeeCard
                      key={user.id}
                      user={user}
                      onClick={() => handleCardClick(user)}
                      onDragStart={() => setDraggedUser(user)}
                      onDragOver={() => {}}
                      onDragLeave={() => {}}
                      onDrop={() => handleDrop(user)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        
        <PageFooter />
      </PageContent>

      {/* Detail Modal */}
      <Modal isOpen={isDetailModalOpen} onClose={() => setIsDetailModalOpen(false)} title={selectedUser?.name || ''} size="lg">
        {selectedUser && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: getColorScheme(selectedUser.department, selectedUser.name).bg }}>
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold" style={{ backgroundColor: getColorScheme(selectedUser.department, selectedUser.name).avatar }}>
                {selectedUser.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
              <div>
                <h3 className="font-bold" style={{ color: getColorScheme(selectedUser.department, selectedUser.name).text }}>{selectedUser.name}</h3>
                <p className="text-sm opacity-80" style={{ color: getColorScheme(selectedUser.department, selectedUser.name).text }}>{selectedUser.position} • {selectedUser.department}</p>
              </div>
            </div>
            
            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2"><Users className="w-4 h-4" />Evaluators ({selectedUserMappings.evaluators.length})</h4>
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {selectedUserMappings.evaluators.map(m => (
                  <div key={m.id} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                    <span className="text-sm">{m.evaluator.name}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded">{RELATIONSHIP_TYPE_LABELS[m.relationshipType]}</span>
                      <button onClick={() => handleDeleteMapping(m.id)} className="p-1 text-red-500"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </div>
                ))}
                {selectedUserMappings.evaluators.length === 0 && <p className="text-sm text-slate-500">None</p>}
              </div>
            </div>
            
            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2"><Link2 className="w-4 h-4" />Evaluates ({selectedUserMappings.evaluates.length})</h4>
              <div className="space-y-1 max-h-36 overflow-y-auto">
                {selectedUserMappings.evaluates.map(m => (
                  <div key={m.id} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                    <span className="text-sm">{m.evaluatee.name}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">{RELATIONSHIP_TYPE_LABELS[m.relationshipType]}</span>
                      <button onClick={() => handleDeleteMapping(m.id)} className="p-1 text-red-500"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </div>
                ))}
                {selectedUserMappings.evaluates.length === 0 && <p className="text-sm text-slate-500">None</p>}
              </div>
            </div>
            
            {/* Assign Manager */}
            <div className="pt-2 border-t">
              <h4 className="text-sm font-semibold mb-2">Assign to Manager</h4>
              <select 
                className="w-full px-3 py-2 border rounded text-sm bg-white"
                onChange={(e) => {
                  if (e.target.value) {
                    const newManager = users.find(u => u.id === e.target.value)
                    if (newManager && selectedUser) {
                      const currentMapping = mappings.find(m => 
                        m.evaluateeId === selectedUser.id && 
                        (m.relationshipType === 'TEAM_LEAD' || m.relationshipType === 'C_LEVEL')
                      )
                      setReassignData({ employee: selectedUser, newManager, oldManager: currentMapping?.evaluator || null })
                      setIsDetailModalOpen(false)
                      setIsReassignModalOpen(true)
                    }
                  }
                }}
                defaultValue=""
              >
                <option value="">Select manager...</option>
                {users.filter(u => u.id !== selectedUser?.id).sort((a, b) => a.name.localeCompare(b.name)).map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({u.position || 'Employee'})</option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Link href={`/admin/mappings?filterEmployee=${selectedUser.id}`} className="px-3 py-1.5 border rounded text-sm flex items-center gap-1"><ArrowUpRight className="w-3 h-3" />All Mappings</Link>
              <button onClick={() => setIsDetailModalOpen(false)} className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm">Close</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reassign Modal */}
      <Modal isOpen={isReassignModalOpen} onClose={() => setIsReassignModalOpen(false)} title="Reassign" size="sm">
        {reassignData.employee && reassignData.newManager && (
          <div className="space-y-4">
            <p>Move <strong>{reassignData.employee.name}</strong> under <strong>{reassignData.newManager.name}</strong>?</p>
            {reassignData.oldManager && <p className="text-sm text-slate-500">Currently reports to: {reassignData.oldManager.name}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setIsReassignModalOpen(false)} className="px-3 py-1.5 border rounded text-sm">Cancel</button>
              <button onClick={handleReassign} className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm flex items-center gap-1"><Save className="w-3 h-3" />Confirm</button>
            </div>
          </div>
        )}
      </Modal>
    </PageContainer>
  )
}
