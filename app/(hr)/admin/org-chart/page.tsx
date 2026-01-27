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
  type Connection,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
  Panel,
  BackgroundVariant,
  Position,
  ConnectionMode,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Modal } from '@/components/ui/modal'
import { PageHeader } from '@/components/layout/page-header'
import { PageFooter } from '@/components/layout/page-footer'
import { PageContainer, PageContent } from '@/components/layout/page-container'
import { RELATIONSHIP_TYPE_LABELS, RelationshipType } from '@/types'
import { Users, Link2, Trash2, ArrowUpRight, GitBranch, Eye, EyeOff, Move, Save } from 'lucide-react'
import { C_LEVEL_EVALUATORS, HR_EVALUATORS } from '@/lib/config'

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
  level: number
  isPartner: boolean
  isLead: boolean
  reportCount: number
  [key: string]: unknown
}

// Position hierarchy levels
const POSITION_LEVELS: Record<string, number> = {
  'Partner': 0,
  'Managing Partner': 0,
  'Operating Partner': 1,
  'Principal': 2,
  'Lead': 2,
  'Director': 2,
  'Senior Manager': 3,
  'Manager': 3,
  'Senior Associate': 4,
  'Associate': 5,
  'Analyst': 6,
  'Intern': 7,
}

function getPositionLevel(position: string | null): number {
  if (!position) return 5
  for (const [key, level] of Object.entries(POSITION_LEVELS)) {
    if (position.toLowerCase().includes(key.toLowerCase())) return level
  }
  return 5
}

// Department colors
const departmentColors: Record<string, { bg: string; border: string; text: string; gradient: string }> = {
  'Executive': { bg: '#FEF3C7', border: '#F59E0B', text: '#92400E', gradient: 'from-amber-400 to-amber-600' },
  'Technology': { bg: '#FEF3C7', border: '#F59E0B', text: '#92400E', gradient: 'from-amber-400 to-amber-600' },
  'Product': { bg: '#CFFAFE', border: '#06B6D4', text: '#155E75', gradient: 'from-cyan-400 to-cyan-600' },
  'Design': { bg: '#DBEAFE', border: '#3B82F6', text: '#1E40AF', gradient: 'from-blue-400 to-blue-600' },
  'Quantitative Engineering': { bg: '#FEF3C7', border: '#F59E0B', text: '#92400E', gradient: 'from-amber-400 to-amber-600' },
  'Software Engineering': { bg: '#FEF3C7', border: '#F59E0B', text: '#92400E', gradient: 'from-amber-400 to-amber-600' },
  'Growth': { bg: '#E9D5FF', border: '#A855F7', text: '#6B21A8', gradient: 'from-purple-400 to-purple-600' },
  'Growth and strategy': { bg: '#E9D5FF', border: '#A855F7', text: '#6B21A8', gradient: 'from-purple-400 to-purple-600' },
  'Research': { bg: '#E9D5FF', border: '#A855F7', text: '#6B21A8', gradient: 'from-purple-400 to-purple-600' },
  'IR': { bg: '#E9D5FF', border: '#A855F7', text: '#6B21A8', gradient: 'from-purple-400 to-purple-600' },
  'Operations': { bg: '#D1FAE5', border: '#10B981', text: '#065F46', gradient: 'from-emerald-400 to-emerald-600' },
  'Accounting and Operations': { bg: '#D1FAE5', border: '#10B981', text: '#065F46', gradient: 'from-emerald-400 to-emerald-600' },
  'Human Resources': { bg: '#FCE7F3', border: '#EC4899', text: '#9D174D', gradient: 'from-pink-400 to-pink-600' },
  'Operating Partner-Value Creation': { bg: '#FEE2E2', border: '#EF4444', text: '#991B1B', gradient: 'from-red-400 to-red-600' },
  'Operating Partner-Execution': { bg: '#FEE2E2', border: '#EF4444', text: '#991B1B', gradient: 'from-red-400 to-red-600' },
  '1to1Plans': { bg: '#D1FAE5', border: '#10B981', text: '#065F46', gradient: 'from-emerald-400 to-emerald-600' },
  'default': { bg: '#F3F4F6', border: '#6366F1', text: '#374151', gradient: 'from-indigo-400 to-indigo-600' },
}

function getColors(department: string | null) {
  if (!department) return departmentColors.default
  return departmentColors[department] || departmentColors.default
}

// Edge styles for different relationship types
const edgeStyles: Record<string, { stroke: string; strokeWidth: number; animated?: boolean; strokeDasharray?: string }> = {
  'C_LEVEL': { stroke: '#F59E0B', strokeWidth: 3, animated: true },
  'TEAM_LEAD': { stroke: '#3B82F6', strokeWidth: 2 },
  'DIRECT_REPORT': { stroke: '#10B981', strokeWidth: 2, strokeDasharray: '5,5' },
  'PEER': { stroke: '#A855F7', strokeWidth: 1, strokeDasharray: '3,3' },
  'HR': { stroke: '#EC4899', strokeWidth: 1, strokeDasharray: '8,4' },
}

// Custom node component
function EmployeeNode({ data, selected, dragging }: { data: EmployeeNodeData; selected: boolean; dragging: boolean }) {
  const { user, isPartner, reportCount } = data
  const colors = getColors(user.department)
  const initials = user.name.split(' ').map(n => n[0]).join('').slice(0, 2)
  
  const isCLevel = C_LEVEL_EVALUATORS.some(name => 
    user.name.toLowerCase() === name.toLowerCase()
  )
  const isHR = HR_EVALUATORS.some(name => 
    user.name.toLowerCase() === name.toLowerCase()
  )
  
  return (
    <div 
      className={`relative transition-all duration-200 ${
        dragging ? 'scale-105 shadow-2xl z-50' : ''
      } ${selected ? 'ring-2 ring-offset-2 ring-indigo-500' : ''}`}
    >
      {/* Connection handles */}
      <div className="absolute -top-1 left-1/2 w-3 h-3 bg-slate-300 rounded-full transform -translate-x-1/2 opacity-0 hover:opacity-100 transition-opacity" />
      <div className="absolute -bottom-1 left-1/2 w-3 h-3 bg-slate-300 rounded-full transform -translate-x-1/2 opacity-0 hover:opacity-100 transition-opacity" />
      
      <div 
        className={`px-4 py-3 rounded-xl border-2 shadow-lg min-w-[180px] backdrop-blur-sm ${
          isCLevel ? 'ring-2 ring-amber-400 ring-offset-2' : ''
        } ${isHR ? 'ring-2 ring-pink-400 ring-offset-2' : ''}`}
        style={{ 
          backgroundColor: colors.bg + 'E6',
          borderColor: colors.border,
        }}
      >
        <div className="flex flex-col items-center text-center">
          {/* Avatar with gradient */}
          <div 
            className={`w-14 h-14 rounded-full flex items-center justify-center text-white text-base font-bold mb-2 shadow-md bg-gradient-to-br ${colors.gradient}`}
          >
            {initials}
          </div>
          
          {/* Name */}
          <div className="font-semibold text-sm" style={{ color: colors.text }}>
            {user.name}
          </div>
          
          {/* Position */}
          <div className="text-xs opacity-80 mt-0.5" style={{ color: colors.text }}>
            {user.position || 'Employee'}
          </div>
          
          {/* Department */}
          {user.department && (
            <div 
              className="text-[10px] px-2 py-0.5 rounded-full mt-1.5 opacity-90"
              style={{ backgroundColor: colors.border + '30', color: colors.text }}
            >
              {user.department}
            </div>
          )}
          
          {/* Badges */}
          <div className="flex gap-1 mt-2">
            {isCLevel && (
              <span className="text-[9px] px-1.5 py-0.5 bg-amber-500 text-white rounded-full font-medium">
                C-Level
              </span>
            )}
            {isHR && (
              <span className="text-[9px] px-1.5 py-0.5 bg-pink-500 text-white rounded-full font-medium">
                HR
              </span>
            )}
            {reportCount > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 bg-blue-500 text-white rounded-full font-medium">
                {reportCount} reports
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const nodeTypes = {
  employee: EmployeeNode,
}

function OrgChartContent() {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [mappings, setMappings] = useState<Mapping[]>([])
  const [loading, setLoading] = useState(true)
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [showRelationships, setShowRelationships] = useState({
    teamLead: true,
    cLevel: true,
    directReport: false,
    peer: false,
    hr: false,
  })
  const [pendingChanges, setPendingChanges] = useState<{
    userId: string
    newManagerId: string
    oldManagerId?: string
  }[]>([])
  const [isReassignModalOpen, setIsReassignModalOpen] = useState(false)
  const [reassignData, setReassignData] = useState<{
    employee: User | null
    newManager: User | null
    oldManager: User | null
  }>({ employee: null, newManager: null, oldManager: null })

  const { fitView } = useReactFlow()

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

    // Build manager relationships from TEAM_LEAD and C_LEVEL mappings
    const reportsTo = new Map<string, { managerId: string; type: 'TEAM_LEAD' | 'C_LEVEL' }>()
    
    mappings
      .filter(m => m.relationshipType === 'TEAM_LEAD' || m.relationshipType === 'C_LEVEL')
      .forEach(m => {
        // Prefer C_LEVEL over TEAM_LEAD
        const existing = reportsTo.get(m.evaluateeId)
        if (!existing || (m.relationshipType === 'C_LEVEL' && existing.type === 'TEAM_LEAD')) {
          reportsTo.set(m.evaluateeId, { 
            managerId: m.evaluatorId, 
            type: m.relationshipType as 'TEAM_LEAD' | 'C_LEVEL' 
          })
        }
      })

    // Build children map
    const children = new Map<string, string[]>()
    reportsTo.forEach(({ managerId }, userId) => {
      if (!children.has(managerId)) children.set(managerId, [])
      children.get(managerId)!.push(userId)
    })

    // Count reports for each user
    const reportCounts = new Map<string, number>()
    children.forEach((kids, managerId) => {
      reportCounts.set(managerId, kids.length)
    })

    // Identify root nodes (C-Level or no manager)
    const roots: string[] = []
    const isCLevelUser = (u: User) => C_LEVEL_EVALUATORS.some(name => 
      u.name.toLowerCase() === name.toLowerCase()
    )
    
    users.forEach(u => {
      if (isCLevelUser(u)) {
        roots.push(u.id)
      }
    })

    // If no C-Level roots found, find people with no manager who have reports
    if (roots.length === 0) {
      users.forEach(u => {
        if (!reportsTo.has(u.id) && children.has(u.id)) {
          roots.push(u.id)
        }
      })
    }

    // Layout configuration
    const HORIZONTAL_SPACING = 220
    const VERTICAL_SPACING = 180
    const nodeList: Node[] = []
    const edgeList: Edge[] = []
    const positioned = new Set<string>()

    // Calculate subtree width
    function getSubtreeWidth(userId: string, visited: Set<string> = new Set()): number {
      if (visited.has(userId)) return HORIZONTAL_SPACING
      visited.add(userId)
      
      const childIds = children.get(userId) || []
      if (childIds.length === 0) return HORIZONTAL_SPACING
      
      let total = 0
      for (const childId of childIds) {
        total += getSubtreeWidth(childId, visited)
      }
      return Math.max(total, HORIZONTAL_SPACING)
    }

    // Position subtree
    function positionSubtree(userId: string, x: number, y: number, level: number) {
      const user = users.find(u => u.id === userId)
      if (!user || positioned.has(userId)) return

      positioned.add(userId)
      const childIds = children.get(userId) || []
      
      // Calculate total width needed for children
      const childWidths = childIds.map(id => getSubtreeWidth(id, new Set([userId])))
      const totalChildWidth = childWidths.reduce((a, b) => a + b, 0)
      
      // Position this node centered above children
      const nodeX = childIds.length > 0 ? x + totalChildWidth / 2 - HORIZONTAL_SPACING / 2 : x

      nodeList.push({
        id: user.id,
        type: 'employee',
        position: { x: nodeX, y },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        draggable: true,
        data: {
          user,
          level,
          isPartner: isCLevelUser(user),
          isLead: childIds.length > 0,
          reportCount: reportCounts.get(user.id) || 0,
        } as EmployeeNodeData,
      })

      // Position and connect children
      let childX = x
      for (let i = 0; i < childIds.length; i++) {
        const childId = childIds[i]
        const relType = reportsTo.get(childId)?.type || 'TEAM_LEAD'
        
        // Add edge
        if (showRelationships.teamLead && relType === 'TEAM_LEAD') {
          edgeList.push({
            id: `${userId}-${childId}-tl`,
            source: userId,
            target: childId,
            type: 'smoothstep',
            style: edgeStyles.TEAM_LEAD,
            markerEnd: { type: MarkerType.ArrowClosed, color: edgeStyles.TEAM_LEAD.stroke, width: 12, height: 12 },
            label: 'Team Lead',
            labelStyle: { fontSize: 9, fill: '#64748B' },
            labelBgStyle: { fill: 'white', fillOpacity: 0.8 },
          })
        }
        if (showRelationships.cLevel && relType === 'C_LEVEL') {
          edgeList.push({
            id: `${userId}-${childId}-cl`,
            source: userId,
            target: childId,
            type: 'smoothstep',
            style: edgeStyles.C_LEVEL,
            animated: true,
            markerEnd: { type: MarkerType.ArrowClosed, color: edgeStyles.C_LEVEL.stroke, width: 12, height: 12 },
            label: 'C-Level',
            labelStyle: { fontSize: 9, fill: '#F59E0B', fontWeight: 600 },
            labelBgStyle: { fill: 'white', fillOpacity: 0.9 },
          })
        }

        positionSubtree(childId, childX, y + VERTICAL_SPACING, level + 1)
        childX += childWidths[i]
      }
    }

    // Position all root trees
    let currentX = 0
    for (const rootId of roots) {
      const width = getSubtreeWidth(rootId)
      positionSubtree(rootId, currentX, 0, 0)
      currentX += width + HORIZONTAL_SPACING / 2
    }

    // Add unconnected employees at the bottom
    const unconnected = users.filter(u => !positioned.has(u.id))
    const ORPHAN_COLS = 8
    let orphanRow = 0
    let orphanCol = 0
    const orphanStartY = nodeList.length > 0 
      ? Math.max(...nodeList.map(n => n.position.y)) + VERTICAL_SPACING * 1.5
      : 0

    for (const user of unconnected) {
      nodeList.push({
        id: user.id,
        type: 'employee',
        position: { 
          x: orphanCol * HORIZONTAL_SPACING, 
          y: orphanStartY + orphanRow * VERTICAL_SPACING 
        },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        draggable: true,
        data: {
          user,
          level: 99,
          isPartner: false,
          isLead: false,
          reportCount: 0,
        } as EmployeeNodeData,
      })
      
      orphanCol++
      if (orphanCol >= ORPHAN_COLS) {
        orphanCol = 0
        orphanRow++
      }
    }

    // Add peer edges if enabled
    if (showRelationships.peer) {
      mappings
        .filter(m => m.relationshipType === 'PEER')
        .forEach(m => {
          edgeList.push({
            id: `peer-${m.id}`,
            source: m.evaluatorId,
            target: m.evaluateeId,
            type: 'straight',
            style: edgeStyles.PEER,
          })
        })
    }

    // Add HR edges if enabled
    if (showRelationships.hr) {
      mappings
        .filter(m => m.relationshipType === 'HR')
        .forEach(m => {
          edgeList.push({
            id: `hr-${m.id}`,
            source: m.evaluatorId,
            target: m.evaluateeId,
            type: 'straight',
            style: edgeStyles.HR,
          })
        })
    }

    setNodes(nodeList)
    setEdges(edgeList)
    
    // Fit view after layout
    setTimeout(() => fitView({ padding: 0.2 }), 100)
  }, [users, mappings, showRelationships, fitView])

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    const userData = node.data as unknown as EmployeeNodeData
    setSelectedUser(userData.user)
    setIsDetailModalOpen(true)
  }, [])

  // Handle drag and drop for reassignment
  const onNodeDragStop = useCallback((event: React.MouseEvent, node: Node, nodes: Node[]) => {
    // Find if dropped near another node (potential new manager)
    const draggedNode = node
    const draggedData = draggedNode.data as unknown as EmployeeNodeData
    
    // Find closest node above the dropped position
    let closestManager: Node | null = null
    let minDistance = Infinity
    
    for (const n of nodes) {
      if (n.id === draggedNode.id) continue
      const nData = n.data as unknown as EmployeeNodeData
      
      // Check if this node is above the dragged node
      if (n.position.y < draggedNode.position.y - 50) {
        const dx = n.position.x - draggedNode.position.x
        const dy = n.position.y - draggedNode.position.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        
        if (distance < 250 && distance < minDistance) {
          minDistance = distance
          closestManager = n
        }
      }
    }
    
    if (closestManager) {
      const managerData = closestManager.data as unknown as EmployeeNodeData
      
      // Find current manager
      const currentManagerMapping = mappings.find(m => 
        m.evaluateeId === draggedData.user.id && 
        (m.relationshipType === 'TEAM_LEAD' || m.relationshipType === 'C_LEVEL')
      )
      const currentManager = currentManagerMapping?.evaluator || null
      
      // Only prompt if actually changing manager
      if (!currentManager || currentManager.id !== managerData.user.id) {
        setReassignData({
          employee: draggedData.user,
          newManager: managerData.user,
          oldManager: currentManager,
        })
        setIsReassignModalOpen(true)
      }
    }
  }, [mappings])

  const handleReassign = async () => {
    if (!reassignData.employee || !reassignData.newManager) return

    try {
      toast.loading('Updating reporting structure...')
      
      const isCLevel = C_LEVEL_EVALUATORS.some(name => 
        reassignData.newManager!.name.toLowerCase() === name.toLowerCase()
      )
      const relationshipType = isCLevel ? 'C_LEVEL' : 'TEAM_LEAD'
      
      // Delete old manager mapping if exists
      if (reassignData.oldManager) {
        const oldMapping = mappings.find(m => 
          m.evaluateeId === reassignData.employee!.id &&
          m.evaluatorId === reassignData.oldManager!.id &&
          (m.relationshipType === 'TEAM_LEAD' || m.relationshipType === 'C_LEVEL')
        )
        if (oldMapping) {
          await fetch(`/api/admin/mappings?id=${oldMapping.id}`, { method: 'DELETE' })
        }
      }
      
      // Create new manager mapping
      await fetch('/api/admin/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evaluatorId: reassignData.newManager.id,
          evaluateeId: reassignData.employee.id,
          relationshipType,
        }),
      })
      
      // Update peers - remove old peer relationships and add new ones based on new team
      // Get new team members (people who report to the same manager)
      const newTeamMembers = mappings.filter(m => 
        m.evaluatorId === reassignData.newManager!.id &&
        (m.relationshipType === 'TEAM_LEAD' || m.relationshipType === 'C_LEVEL') &&
        m.evaluateeId !== reassignData.employee!.id
      ).map(m => m.evaluateeId)
      
      // Create peer mappings with new team members
      for (const peerId of newTeamMembers) {
        // Two-way peer relationship
        await fetch('/api/admin/mappings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            evaluatorId: reassignData.employee!.id,
            evaluateeId: peerId,
            relationshipType: 'PEER',
          }),
        })
        await fetch('/api/admin/mappings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            evaluatorId: peerId,
            evaluateeId: reassignData.employee!.id,
            relationshipType: 'PEER',
          }),
        })
      }
      
      toast.dismiss()
      toast.success(`${reassignData.employee.name} now reports to ${reassignData.newManager.name}`)
      setIsReassignModalOpen(false)
      loadData() // Reload to reflect changes
    } catch (error) {
      toast.dismiss()
      toast.error('Failed to update reporting structure')
    }
  }

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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full gradient-primary animate-pulse" />
          <p className="text-muted text-sm">Loading org chart...</p>
        </motion.div>
      </div>
    )
  }

  return (
    <>
      <PageHeader backHref="/admin/mappings" backLabel="Back to Mappings" badge="Org Chart" />
      
      <PageContent className="!max-w-none !px-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Organization Chart</h1>
            <p className="text-muted mt-1">{users.length} employees • Drag employees to reassign managers</p>
          </div>
        </div>

        {/* React Flow Canvas */}
        <div className="h-[calc(100vh-200px)] min-h-[600px] bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 rounded-xl border border-border overflow-hidden shadow-inner">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onNodeDragStop={onNodeDragStop}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.1}
            maxZoom={2}
            connectionMode={ConnectionMode.Loose}
            defaultEdgeOptions={{
              type: 'smoothstep',
            }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#CBD5E1" />
            <Controls showInteractive={false} />
            
            {/* Legend Panel */}
            <Panel position="top-left" className="bg-white/95 dark:bg-gray-800/95 rounded-xl shadow-xl p-4 border border-gray-200 dark:border-gray-700 backdrop-blur-sm">
              <div className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3 flex items-center gap-2">
                <GitBranch className="w-4 h-4" />
                Relationships
              </div>
              
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showRelationships.cLevel}
                    onChange={e => setShowRelationships(s => ({ ...s, cLevel: e.target.checked }))}
                    className="rounded border-gray-300"
                  />
                  <div className="w-6 h-0.5 rounded" style={{ backgroundColor: edgeStyles.C_LEVEL.stroke }} />
                  <span className="text-xs text-gray-600 dark:text-gray-400">C-Level (40%)</span>
                </label>
                
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showRelationships.teamLead}
                    onChange={e => setShowRelationships(s => ({ ...s, teamLead: e.target.checked }))}
                    className="rounded border-gray-300"
                  />
                  <div className="w-6 h-0.5 rounded" style={{ backgroundColor: edgeStyles.TEAM_LEAD.stroke }} />
                  <span className="text-xs text-gray-600 dark:text-gray-400">Team Lead (25%)</span>
                </label>
                
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showRelationships.peer}
                    onChange={e => setShowRelationships(s => ({ ...s, peer: e.target.checked }))}
                    className="rounded border-gray-300"
                  />
                  <div className="w-6 h-0.5 rounded" style={{ backgroundColor: edgeStyles.PEER.stroke, borderStyle: 'dashed' }} />
                  <span className="text-xs text-gray-600 dark:text-gray-400">Peers (15%)</span>
                </label>
                
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showRelationships.hr}
                    onChange={e => setShowRelationships(s => ({ ...s, hr: e.target.checked }))}
                    className="rounded border-gray-300"
                  />
                  <div className="w-6 h-0.5 rounded" style={{ backgroundColor: edgeStyles.HR.stroke }} />
                  <span className="text-xs text-gray-600 dark:text-gray-400">HR (10%)</span>
                </label>
              </div>
              
              <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
                <div className="text-[10px] text-gray-500 dark:text-gray-400">
                  <Move className="w-3 h-3 inline mr-1" />
                  Drag to reassign
                </div>
              </div>
            </Panel>

            {/* Department Legend */}
            <Panel position="top-right" className="bg-white/95 dark:bg-gray-800/95 rounded-xl shadow-xl p-4 border border-gray-200 dark:border-gray-700 backdrop-blur-sm max-w-[200px]">
              <div className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">Departments</div>
              <div className="grid gap-1.5 text-xs">
                {Object.entries(departmentColors).slice(0, 10).map(([dept, colors]) => (
                  dept !== 'default' && (
                    <div key={dept} className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full shadow-sm" 
                        style={{ backgroundColor: colors.border }} 
                      />
                      <span className="text-gray-600 dark:text-gray-400 truncate text-[11px]">{dept}</span>
                    </div>
                  )
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
            <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-xl">
              <div 
                className={`w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-semibold shadow-lg bg-gradient-to-br ${getColors(selectedUser.department).gradient}`}
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
                <Users className="w-4 h-4 text-indigo-500" />
                Who Evaluates {selectedUser.name.split(' ')[0]} ({selectedUserMappings.evaluators.length})
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {selectedUserMappings.evaluators.length === 0 ? (
                  <p className="text-sm text-muted py-2">No evaluators assigned</p>
                ) : (
                  selectedUserMappings.evaluators.map(mapping => (
                    <div key={mapping.id} className="flex items-center justify-between p-3 bg-surface rounded-lg hover:bg-surface/80 transition-colors">
                      <div className="flex items-center gap-3">
                        <div 
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium shadow bg-gradient-to-br ${getColors(mapping.evaluator.department).gradient}`}
                        >
                          {mapping.evaluator.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <div className="font-medium text-foreground text-sm">{mapping.evaluator.name}</div>
                          <div className="text-xs text-muted">{mapping.evaluator.position}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span 
                          className="px-2 py-1 rounded text-xs font-medium"
                          style={{ 
                            backgroundColor: edgeStyles[mapping.relationshipType]?.stroke + '20',
                            color: edgeStyles[mapping.relationshipType]?.stroke 
                          }}
                        >
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
                <Link2 className="w-4 h-4 text-emerald-500" />
                {selectedUser.name.split(' ')[0]} Evaluates ({selectedUserMappings.evaluates.length})
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {selectedUserMappings.evaluates.length === 0 ? (
                  <p className="text-sm text-muted py-2">Not assigned to evaluate anyone</p>
                ) : (
                  selectedUserMappings.evaluates.map(mapping => (
                    <div key={mapping.id} className="flex items-center justify-between p-3 bg-surface rounded-lg hover:bg-surface/80 transition-colors">
                      <div className="flex items-center gap-3">
                        <div 
                          className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium shadow bg-gradient-to-br ${getColors(mapping.evaluatee.department).gradient}`}
                        >
                          {mapping.evaluatee.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <div className="font-medium text-foreground text-sm">{mapping.evaluatee.name}</div>
                          <div className="text-xs text-muted">{mapping.evaluatee.position}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span 
                          className="px-2 py-1 rounded text-xs font-medium"
                          style={{ 
                            backgroundColor: edgeStyles[mapping.relationshipType]?.stroke + '20',
                            color: edgeStyles[mapping.relationshipType]?.stroke 
                          }}
                        >
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
                className="px-4 py-2 border border-border rounded-lg hover:bg-surface text-foreground transition-colors text-sm flex items-center gap-2"
              >
                <ArrowUpRight className="w-4 h-4" />
                Edit Mappings
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

      {/* Reassign Confirmation Modal */}
      <Modal 
        isOpen={isReassignModalOpen} 
        onClose={() => setIsReassignModalOpen(false)} 
        title="Confirm Reassignment"
        size="md"
      >
        {reassignData.employee && reassignData.newManager && (
          <div className="space-y-4">
            <p className="text-foreground">
              Move <strong>{reassignData.employee.name}</strong> to report to{' '}
              <strong>{reassignData.newManager.name}</strong>?
            </p>
            
            {reassignData.oldManager && (
              <p className="text-sm text-muted">
                Currently reports to: <strong>{reassignData.oldManager.name}</strong>
              </p>
            )}
            
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                <strong>This will:</strong>
              </p>
              <ul className="text-sm text-amber-700 dark:text-amber-300 mt-1 list-disc list-inside">
                <li>Create {C_LEVEL_EVALUATORS.some(n => reassignData.newManager!.name.toLowerCase() === n.toLowerCase()) ? 'C-Level' : 'Team Lead'} mapping</li>
                <li>Add peer relationships with new team members</li>
                {reassignData.oldManager && <li>Remove old manager relationship</li>}
              </ul>
            </div>
            
            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={() => setIsReassignModalOpen(false)}
                className="px-4 py-2 border border-border rounded-lg hover:bg-surface text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReassign}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                Confirm Move
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}

export default function OrgChartPage() {
  return (
    <PageContainer>
      <ReactFlowProvider>
        <OrgChartContent />
      </ReactFlowProvider>
    </PageContainer>
  )
}
