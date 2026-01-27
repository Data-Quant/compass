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
  Position,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Modal } from '@/components/ui/modal'
import { PageHeader } from '@/components/layout/page-header'
import { PageFooter } from '@/components/layout/page-footer'
import { PageContainer, PageContent } from '@/components/layout/page-container'
import { RELATIONSHIP_TYPE_LABELS, RelationshipType } from '@/types'
import { Users, Link2, Trash2, ZoomIn, ZoomOut } from 'lucide-react'

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
  isPartner: boolean
  isLead: boolean
}

// Department colors matching the org chart
const departmentColors: Record<string, { bg: string; border: string; text: string }> = {
  'Executive': { bg: '#FEF3C7', border: '#F59E0B', text: '#92400E' },
  'Technology': { bg: '#FEF3C7', border: '#F59E0B', text: '#92400E' },
  'Product': { bg: '#CFFAFE', border: '#06B6D4', text: '#155E75' },
  'Design': { bg: '#DBEAFE', border: '#3B82F6', text: '#1E40AF' },
  'Quantitative Engineering': { bg: '#FEF3C7', border: '#F59E0B', text: '#92400E' },
  'Software Engineering': { bg: '#FEF3C7', border: '#F59E0B', text: '#92400E' },
  'Growth': { bg: '#E9D5FF', border: '#A855F7', text: '#6B21A8' },
  'Growth and strategy': { bg: '#E9D5FF', border: '#A855F7', text: '#6B21A8' },
  'Research': { bg: '#E9D5FF', border: '#A855F7', text: '#6B21A8' },
  'IR': { bg: '#E9D5FF', border: '#A855F7', text: '#6B21A8' },
  'Operations': { bg: '#D1FAE5', border: '#10B981', text: '#065F46' },
  'Accounting and Operations': { bg: '#D1FAE5', border: '#10B981', text: '#065F46' },
  'Human Resources': { bg: '#FCE7F3', border: '#EC4899', text: '#9D174D' },
  'Operating Partner-Value Creation': { bg: '#FEE2E2', border: '#EF4444', text: '#991B1B' },
  'Operating Partner-Execution': { bg: '#FEE2E2', border: '#EF4444', text: '#991B1B' },
  '1to1Plans': { bg: '#D1FAE5', border: '#10B981', text: '#065F46' },
  'default': { bg: '#F3F4F6', border: '#9CA3AF', text: '#374151' },
}

function getColors(department: string | null) {
  if (!department) return departmentColors.default
  return departmentColors[department] || departmentColors.default
}

// Custom node component
function EmployeeNode({ data, selected }: { data: EmployeeNodeData; selected: boolean }) {
  const { user, isPartner, isLead } = data
  const colors = getColors(user.department)
  const initials = user.name.split(' ').map(n => n[0]).join('').slice(0, 2)
  
  return (
    <div 
      className={`px-4 py-3 rounded-lg border-2 transition-all shadow-md min-w-[160px] ${
        selected ? 'ring-2 ring-offset-2 ring-indigo-500' : ''
      }`}
      style={{ 
        backgroundColor: colors.bg, 
        borderColor: colors.border,
      }}
    >
      <div className="flex flex-col items-center text-center">
        <div 
          className="w-12 h-12 rounded-full flex items-center justify-center text-white text-sm font-bold mb-2"
          style={{ backgroundColor: colors.border }}
        >
          {initials}
        </div>
        <div className="font-semibold text-sm" style={{ color: colors.text }}>
          {user.name}
        </div>
        <div className="text-xs opacity-75 mt-0.5" style={{ color: colors.text }}>
          {user.position || 'Employee'}
        </div>
        {user.department && (
          <div className="text-xs opacity-60 mt-0.5" style={{ color: colors.text }}>
            {user.department}
          </div>
        )}
      </div>
    </div>
  )
}

const nodeTypes = {
  employee: EmployeeNode,
}

// C-Level people (Partners)
const C_LEVEL_NAMES = ['Hamiz Awan', 'Brad Herman', 'Daniyal Awan', 'Richard Reizes']

export default function OrgChartPage() {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [mappings, setMappings] = useState<Mapping[]>([])
  const [loading, setLoading] = useState(true)
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)

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

  // Build hierarchical graph
  useEffect(() => {
    if (users.length === 0) return

    // Find who reports to whom based on TEAM_LEAD mappings
    // If A evaluates B as TEAM_LEAD, then B reports to A
    const reportsTo = new Map<string, string>() // userId -> managerId
    
    mappings
      .filter(m => m.relationshipType === 'TEAM_LEAD' || m.relationshipType === 'C_LEVEL')
      .forEach(m => {
        // evaluator is the manager, evaluatee reports to them
        if (!reportsTo.has(m.evaluateeId)) {
          reportsTo.set(m.evaluateeId, m.evaluatorId)
        }
      })

    // Build tree structure
    const children = new Map<string, string[]>() // managerId -> [reportIds]
    reportsTo.forEach((managerId, userId) => {
      if (!children.has(managerId)) children.set(managerId, [])
      children.get(managerId)!.push(userId)
    })

    // Find root nodes (people with no manager or C-Level)
    const roots: string[] = []
    users.forEach(u => {
      const isCLevel = C_LEVEL_NAMES.some(name => 
        u.name.toLowerCase().includes(name.toLowerCase())
      )
      if (isCLevel || !reportsTo.has(u.id)) {
        // Check if this person is actually a manager (has reports)
        if (isCLevel || children.has(u.id)) {
          roots.push(u.id)
        }
      }
    })

    // Position nodes in a tree layout
    const nodeList: Node[] = []
    const edgeList: Edge[] = []
    const positioned = new Set<string>()

    const HORIZONTAL_SPACING = 200
    const VERTICAL_SPACING = 150

    // Position a subtree
    function positionSubtree(
      userId: string, 
      x: number, 
      y: number, 
      level: number
    ): { width: number; nodes: Node[]; edges: Edge[] } {
      const user = users.find(u => u.id === userId)
      if (!user || positioned.has(userId)) {
        return { width: 0, nodes: [], edges: [] }
      }
      positioned.add(userId)

      const childIds = children.get(userId) || []
      const localNodes: Node[] = []
      const localEdges: Edge[] = []

      // Position children first to calculate width
      let childX = x
      let totalChildWidth = 0
      const childResults: { width: number; nodes: Node[]; edges: Edge[] }[] = []

      for (const childId of childIds) {
        const result = positionSubtree(childId, childX, y + VERTICAL_SPACING, level + 1)
        childResults.push(result)
        localNodes.push(...result.nodes)
        localEdges.push(...result.edges)
        childX += Math.max(result.width, HORIZONTAL_SPACING)
        totalChildWidth += Math.max(result.width, HORIZONTAL_SPACING)
      }

      // Center this node above its children
      const nodeX = childIds.length > 0 
        ? x + totalChildWidth / 2 - HORIZONTAL_SPACING / 2
        : x

      const isPartner = C_LEVEL_NAMES.some(name => 
        user.name.toLowerCase().includes(name.toLowerCase())
      )

      localNodes.push({
        id: user.id,
        type: 'employee',
        position: { x: nodeX, y },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        data: {
          user,
          isPartner,
          isLead: childIds.length > 0,
        },
      })

      // Create edges to children
      for (const childId of childIds) {
        localEdges.push({
          id: `${userId}-${childId}`,
          source: userId,
          target: childId,
          type: 'smoothstep',
          style: { stroke: '#94A3B8', strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#94A3B8', width: 15, height: 15 },
        })
      }

      return {
        width: Math.max(totalChildWidth, HORIZONTAL_SPACING),
        nodes: localNodes,
        edges: localEdges,
      }
    }

    // Position all root trees
    let currentX = 0
    for (const rootId of roots) {
      const result = positionSubtree(rootId, currentX, 0, 0)
      nodeList.push(...result.nodes)
      edgeList.push(...result.edges)
      currentX += result.width + HORIZONTAL_SPACING
    }

    // Add remaining users (those without any hierarchy connection)
    let orphanX = currentX + HORIZONTAL_SPACING
    let orphanY = 0
    const orphansPerRow = 5
    let orphanCount = 0

    users.forEach(u => {
      if (!positioned.has(u.id)) {
        nodeList.push({
          id: u.id,
          type: 'employee',
          position: { 
            x: orphanX + (orphanCount % orphansPerRow) * HORIZONTAL_SPACING, 
            y: orphanY + Math.floor(orphanCount / orphansPerRow) * VERTICAL_SPACING 
          },
          sourcePosition: Position.Bottom,
          targetPosition: Position.Top,
          data: {
            user: u,
            isPartner: false,
            isLead: false,
          },
        })
        orphanCount++
      }
    })

    setNodes(nodeList)
    setEdges(edgeList)
  }, [users, mappings])

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
        </div>

        {/* React Flow Canvas */}
        <div className="h-[calc(100vh-220px)] min-h-[600px] bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 rounded-xl border border-border overflow-hidden">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            minZoom={0.1}
            maxZoom={2}
            defaultEdgeOptions={{
              type: 'smoothstep',
            }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#CBD5E1" />
            <Controls showInteractive={false} />
            <Panel position="top-left" className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-3 border border-gray-200 dark:border-gray-700">
              <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Departments</div>
              <div className="grid grid-cols-2 gap-1 text-xs">
                {Object.entries(departmentColors).slice(0, 8).map(([dept, colors]) => (
                  <div key={dept} className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}` }} />
                    <span className="text-gray-600 dark:text-gray-400 truncate">{dept}</span>
                  </div>
                ))}
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
              <div 
                className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-semibold"
                style={{ backgroundColor: getColors(selectedUser.department).border }}
              >
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
                        <div 
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium"
                          style={{ backgroundColor: getColors(mapping.evaluator.department).border }}
                        >
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
                        <div 
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium"
                          style={{ backgroundColor: getColors(mapping.evaluatee.department).border }}
                        >
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
