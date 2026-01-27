'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  ReactFlow,
  type Node,
  type Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
  Panel,
  BackgroundVariant,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Modal } from '@/components/ui/modal'
import { PageHeader } from '@/components/layout/page-header'
import { PageFooter } from '@/components/layout/page-footer'
import { PageContainer, PageContent } from '@/components/layout/page-container'
import { RELATIONSHIP_TYPE_LABELS, RelationshipType } from '@/types'
import { Users, Link2, ChevronRight, X, Edit2, Plus, Trash2 } from 'lucide-react'

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

interface EmployeeNodeData {
  user: User
  mappings: Mapping[]
  evaluators: Mapping[]
}

// Custom node component for employees
function EmployeeNode({ data, selected }: { data: EmployeeNodeData; selected: boolean }) {
  const { user, mappings, evaluators } = data
  const initials = user.name.split(' ').map(n => n[0]).join('').slice(0, 2)
  
  return (
    <div className={`px-4 py-3 rounded-xl bg-white dark:bg-gray-800 border-2 transition-all shadow-lg ${
      selected ? 'border-indigo-500 shadow-indigo-500/20' : 'border-gray-200 dark:border-gray-700'
    }`}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-sm font-semibold">
          {initials}
        </div>
        <div>
          <div className="font-semibold text-gray-900 dark:text-white text-sm">{user.name}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">{user.position || user.department || 'Employee'}</div>
        </div>
      </div>
      <div className="mt-2 flex gap-2 text-xs">
        <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded">
          {evaluators.length} evaluators
        </span>
        <span className="px-2 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded">
          {mappings.length} evaluates
        </span>
      </div>
    </div>
  )
}

const nodeTypes = {
  employee: EmployeeNode,
}

export default function OrgChartPage() {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [mappings, setMappings] = useState<Mapping[]>([])
  const [loading, setLoading] = useState(true)
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [viewMode, setViewMode] = useState<'hierarchy' | 'department'>('department')

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

  // Build graph from data
  useEffect(() => {
    if (users.length === 0) return

    const nodeMap = new Map<string, Node>()
    const edgeList: Edge[] = []

    // Group users by department for layout
    const departments = new Map<string, User[]>()
    users.forEach(user => {
      const dept = user.department || 'Other'
      if (!departments.has(dept)) departments.set(dept, [])
      departments.get(dept)!.push(user)
    })

    // Create nodes
    let xOffset = 0
    const departmentOrder = Array.from(departments.keys()).sort()
    
    departmentOrder.forEach((dept, deptIndex) => {
      const deptUsers = departments.get(dept)!
      
      deptUsers.forEach((user, userIndex) => {
        const userMappings = mappings.filter(m => m.evaluatorId === user.id)
        const userEvaluators = mappings.filter(m => m.evaluateeId === user.id)
        
        const node: Node = {
          id: user.id,
          type: 'employee',
          position: { 
            x: deptIndex * 350, 
            y: userIndex * 120 
          },
          data: {
            user,
            mappings: userMappings,
            evaluators: userEvaluators,
          },
        }
        nodeMap.set(user.id, node)
      })
    })

    // Create edges for TEAM_LEAD relationships (shows reporting structure)
    const teamLeadMappings = mappings.filter(m => m.relationshipType === 'TEAM_LEAD')
    teamLeadMappings.forEach(mapping => {
      edgeList.push({
        id: `${mapping.evaluatorId}-${mapping.evaluateeId}`,
        source: mapping.evaluatorId,
        target: mapping.evaluateeId,
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#6366f1', strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' },
        label: 'reports to',
        labelStyle: { fontSize: 10, fill: '#6366f1' },
      })
    })

    setNodes(Array.from(nodeMap.values()))
    setEdges(edgeList)
  }, [users, mappings, viewMode])

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    const userData = node.data as unknown as EmployeeNodeData
    setSelectedUser(userData.user)
    setIsDetailModalOpen(true)
  }, [])

  const selectedUserMappings = useMemo(() => {
    if (!selectedUser) return { evaluators: [], evaluates: [] }
    return {
      evaluators: mappings.filter(m => m.evaluateeId === selectedUser.id),
      evaluates: mappings.filter(m => m.evaluatorId === selectedUser.id),
    }
  }, [selectedUser, mappings])

  const handleDeleteMapping = async (mappingId: string) => {
    try {
      const res = await fetch(`/api/admin/mappings?id=${mappingId}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.error) toast.error(data.error)
      else { toast.success('Mapping deleted'); loadData() }
    } catch { toast.error('Failed to delete mapping') }
  }

  if (loading) {
    return (
      <PageContainer>
        <div className="min-h-screen flex items-center justify-center">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full gradient-primary animate-pulse" />
            <p className="text-muted text-sm">Loading org chart...</p>
          </motion.div>
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader backHref="/admin/mappings" backLabel="Back to Mappings" badge="Org Chart" />
      
      <PageContent className="!max-w-none !px-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Organization Chart</h1>
            <p className="text-muted mt-1">{users.length} employees • Click on a node to view details</p>
          </div>
          <div className="flex gap-2">
            <select
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value as 'hierarchy' | 'department')}
              className="px-4 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            >
              <option value="department">Group by Department</option>
              <option value="hierarchy">Reporting Hierarchy</option>
            </select>
          </div>
        </div>

        {/* React Flow Canvas */}
        <div className="h-[calc(100vh-250px)] min-h-[500px] bg-surface rounded-xl border border-border overflow-hidden">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.1}
            maxZoom={2}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
            <Controls />
            <Panel position="top-left" className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-3 border border-gray-200 dark:border-gray-700">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Legend</div>
              <div className="flex flex-col gap-1 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-0.5 bg-indigo-500"></div>
                  <span className="text-gray-600 dark:text-gray-300">Reports to (Team Lead)</span>
                </div>
              </div>
            </Panel>
          </ReactFlow>
        </div>

        <PageFooter />
      </PageContent>

      {/* Employee Detail Modal */}
      <Modal 
        isOpen={isDetailModalOpen} 
        onClose={() => { setIsDetailModalOpen(false); setSelectedUser(null) }} 
        title={selectedUser?.name || 'Employee Details'}
        size="lg"
      >
        {selectedUser && (
          <div className="space-y-6">
            {/* Employee Info */}
            <div className="flex items-center gap-4 p-4 bg-surface rounded-xl">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xl font-semibold">
                {selectedUser.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
              <div>
                <h3 className="text-xl font-bold text-foreground">{selectedUser.name}</h3>
                <p className="text-muted">{selectedUser.position || 'No position'}</p>
                <p className="text-sm text-muted">{selectedUser.department || 'No department'}</p>
              </div>
            </div>

            {/* Who evaluates this person */}
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Users className="w-4 h-4" />
                Who Evaluates {selectedUser.name.split(' ')[0]} ({selectedUserMappings.evaluators.length})
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {selectedUserMappings.evaluators.length === 0 ? (
                  <p className="text-sm text-muted py-2">No evaluators assigned</p>
                ) : (
                  selectedUserMappings.evaluators.map(mapping => (
                    <div key={mapping.id} className="flex items-center justify-between p-3 bg-surface rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-medium">
                          {mapping.evaluator.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <div className="font-medium text-foreground text-sm">{mapping.evaluator.name}</div>
                          <div className="text-xs text-muted">{mapping.evaluator.department}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded text-xs">
                          {RELATIONSHIP_TYPE_LABELS[mapping.relationshipType]}
                        </span>
                        <button 
                          onClick={() => handleDeleteMapping(mapping.id)}
                          className="p-1.5 text-muted hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Who this person evaluates */}
            <div>
              <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Link2 className="w-4 h-4" />
                {selectedUser.name.split(' ')[0]} Evaluates ({selectedUserMappings.evaluates.length})
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {selectedUserMappings.evaluates.length === 0 ? (
                  <p className="text-sm text-muted py-2">Not assigned to evaluate anyone</p>
                ) : (
                  selectedUserMappings.evaluates.map(mapping => (
                    <div key={mapping.id} className="flex items-center justify-between p-3 bg-surface rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white text-xs font-medium">
                          {mapping.evaluatee.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <div className="font-medium text-foreground text-sm">{mapping.evaluatee.name}</div>
                          <div className="text-xs text-muted">{mapping.evaluatee.department}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded text-xs">
                          {RELATIONSHIP_TYPE_LABELS[mapping.relationshipType]}
                        </span>
                        <button 
                          onClick={() => handleDeleteMapping(mapping.id)}
                          className="p-1.5 text-muted hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Link
                href={`/admin/mappings?filterEmployee=${selectedUser.id}`}
                className="px-4 py-2 border border-border rounded-lg hover:bg-surface text-foreground transition-colors text-sm"
              >
                View All Mappings
              </Link>
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </PageContainer>
  )
}
