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
import { Users, Link2, Trash2, ArrowUpRight, Save, Building2 } from 'lucide-react'
import { C_LEVEL_EVALUATORS, HR_EVALUATORS, COMPANY_NAME } from '@/lib/config'

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
  color: string
  textColor: string
  borderColor: string
  isCompanyNode?: boolean
  isDeptLabel?: boolean
  label?: string
  [key: string]: unknown
}

// Department colors matching the reference org chart exactly
const DEPT_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  // Partners/Executive - different colors for each
  'Partner-Hamiz': { bg: '#86EFAC', border: '#22C55E', text: '#14532D' }, // Green
  'Partner-Richard': { bg: '#86EFAC', border: '#22C55E', text: '#14532D' }, // Green  
  'Partner-Maryam': { bg: '#F9A8D4', border: '#EC4899', text: '#831843' }, // Pink
  'Partner-Brad': { bg: '#FCA5A5', border: '#EF4444', text: '#7F1D1D' }, // Red
  'Partner-Daniyal': { bg: '#FDBA74', border: '#F97316', text: '#7C2D12' }, // Orange
  
  // Departments
  '1to1Plans': { bg: '#86EFAC', border: '#22C55E', text: '#14532D' }, // Green
  'Design': { bg: '#93C5FD', border: '#3B82F6', text: '#1E3A8A' }, // Blue
  'Product': { bg: '#93C5FD', border: '#3B82F6', text: '#1E3A8A' }, // Blue
  'Marketing': { bg: '#93C5FD', border: '#3B82F6', text: '#1E3A8A' }, // Blue
  'Software Engineering': { bg: '#93C5FD', border: '#3B82F6', text: '#1E3A8A' }, // Blue
  'Growth': { bg: '#D8B4FE', border: '#A855F7', text: '#581C87' }, // Purple
  'Growth and strategy': { bg: '#D8B4FE', border: '#A855F7', text: '#581C87' }, // Purple
  'IR': { bg: '#D8B4FE', border: '#A855F7', text: '#581C87' }, // Purple  
  'Research': { bg: '#D8B4FE', border: '#A855F7', text: '#581C87' }, // Purple
  'Quantitative Engineering': { bg: '#FDE68A', border: '#F59E0B', text: '#78350F' }, // Yellow/Orange
  'Technology': { bg: '#FDE68A', border: '#F59E0B', text: '#78350F' }, // Yellow/Orange
  'SOA': { bg: '#FDE68A', border: '#F59E0B', text: '#78350F' }, // Yellow/Orange
  'Operations': { bg: '#86EFAC', border: '#22C55E', text: '#14532D' }, // Green
  'Accounting and Operations': { bg: '#86EFAC', border: '#22C55E', text: '#14532D' }, // Green
  'Legal': { bg: '#86EFAC', border: '#22C55E', text: '#14532D' }, // Green
  'Finance and Accounting': { bg: '#86EFAC', border: '#22C55E', text: '#14532D' }, // Green
  'Human Resources': { bg: '#F9A8D4', border: '#EC4899', text: '#831843' }, // Pink
  'Operating Partner-Value Creation': { bg: '#FCA5A5', border: '#EF4444', text: '#7F1D1D' }, // Red
  'Operating Partner-Execution': { bg: '#FDBA74', border: '#F97316', text: '#7C2D12' }, // Orange
  'Executive': { bg: '#86EFAC', border: '#22C55E', text: '#14532D' }, // Green
  'default': { bg: '#E5E7EB', border: '#9CA3AF', text: '#374151' }, // Gray
}

function getDeptColor(dept: string | null, userName?: string) {
  // Special handling for partners
  if (userName) {
    if (userName.includes('Hamiz')) return DEPT_COLORS['Partner-Hamiz']
    if (userName.includes('Richard')) return DEPT_COLORS['Partner-Richard']
    if (userName.includes('Maryam')) return DEPT_COLORS['Partner-Maryam']
    if (userName.includes('Brad')) return DEPT_COLORS['Partner-Brad']
    if (userName.includes('Daniyal')) return DEPT_COLORS['Partner-Daniyal']
  }
  if (!dept) return DEPT_COLORS.default
  return DEPT_COLORS[dept] || DEPT_COLORS.default
}

// Company logo node
function CompanyNode({ data }: { data: EmployeeNodeData }) {
  return (
    <div className="px-6 py-3 bg-white rounded-xl shadow-lg border-2 border-slate-200 flex items-center gap-3">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
        <Building2 className="w-5 h-5 text-white" />
      </div>
      <span className="font-bold text-lg text-slate-800">{COMPANY_NAME}</span>
    </div>
  )
}

// Department label node
function DeptLabelNode({ data }: { data: EmployeeNodeData }) {
  return (
    <div 
      className="px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm"
      style={{ 
        backgroundColor: data.color,
        borderColor: data.borderColor,
        color: data.textColor,
        borderWidth: 1,
      }}
    >
      {data.label}
    </div>
  )
}

// Employee card node - matching the reference design
function EmployeeNode({ data, selected, dragging }: { data: EmployeeNodeData; selected: boolean; dragging: boolean }) {
  const { user, color, textColor, borderColor } = data
  const initials = user.name.split(' ').map(n => n[0]).join('').slice(0, 2)
  
  const isCLevel = C_LEVEL_EVALUATORS.some(name => 
    user.name.toLowerCase() === name.toLowerCase()
  )
  
  return (
    <div 
      className={`transition-all duration-200 ${
        dragging ? 'scale-105 shadow-2xl z-50' : ''
      } ${selected ? 'ring-2 ring-offset-2 ring-indigo-500' : ''}`}
    >
      <div 
        className="w-[140px] rounded-lg border-2 shadow-md overflow-hidden"
        style={{ 
          backgroundColor: color,
          borderColor: borderColor,
        }}
      >
        {/* Avatar area */}
        <div className="pt-3 pb-2 flex justify-center">
          <div 
            className="w-12 h-12 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-inner"
            style={{ backgroundColor: borderColor }}
          >
            {initials}
          </div>
        </div>
        
        {/* Name and position */}
        <div className="px-2 pb-3 text-center">
          <div 
            className="font-semibold text-xs leading-tight"
            style={{ color: textColor }}
          >
            {user.name}
          </div>
          <div 
            className="text-[10px] mt-0.5 opacity-80 leading-tight"
            style={{ color: textColor }}
          >
            {user.position || 'Employee'}
          </div>
        </div>
      </div>
    </div>
  )
}

const nodeTypes = {
  company: CompanyNode,
  deptLabel: DeptLabelNode,
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

  // Build the org chart layout matching the reference
  useEffect(() => {
    if (users.length === 0) return

    const nodeList: Node[] = []
    const edgeList: Edge[] = []
    
    // Layout constants
    const CARD_WIDTH = 140
    const CARD_HEIGHT = 100
    const H_GAP = 20
    const V_GAP = 60
    const DEPT_GAP = 40

    // Find key people
    const hamiz = users.find(u => u.name.toLowerCase().includes('hamiz'))
    const richard = users.find(u => u.name.toLowerCase().includes('richard'))
    const maryam = users.find(u => u.name.toLowerCase().includes('maryam'))
    const brad = users.find(u => u.name.toLowerCase().includes('brad'))
    const daniyal = users.find(u => u.name.toLowerCase().includes('daniyal'))

    // Build manager relationships
    const reportsTo = new Map<string, string>()
    mappings
      .filter(m => m.relationshipType === 'TEAM_LEAD' || m.relationshipType === 'C_LEVEL')
      .forEach(m => {
        if (!reportsTo.has(m.evaluateeId)) {
          reportsTo.set(m.evaluateeId, m.evaluatorId)
        }
      })

    // Get direct reports for a manager
    const getReports = (managerId: string) => {
      return users.filter(u => reportsTo.get(u.id) === managerId)
    }

    // Group users by department
    const byDept = new Map<string, User[]>()
    users.forEach(u => {
      const dept = u.department || 'Other'
      if (!byDept.has(dept)) byDept.set(dept, [])
      byDept.get(dept)!.push(u)
    })

    // Helper to create employee node
    const createEmployeeNode = (user: User, x: number, y: number): Node => {
      const colors = getDeptColor(user.department, user.name)
      return {
        id: user.id,
        type: 'employee',
        position: { x, y },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        draggable: true,
        data: {
          user,
          color: colors.bg,
          textColor: colors.text,
          borderColor: colors.border,
        } as EmployeeNodeData,
      }
    }

    // Helper to create edge
    const createEdge = (sourceId: string, targetId: string, color: string): Edge => ({
      id: `${sourceId}-${targetId}`,
      source: sourceId,
      target: targetId,
      type: 'smoothstep',
      style: { stroke: color, strokeWidth: 2 },
    })

    // ===== BUILD THE CHART =====
    let centerX = 800
    let currentY = 0

    // 1. Company node at top
    nodeList.push({
      id: 'company',
      type: 'company',
      position: { x: centerX - 80, y: currentY },
      draggable: false,
      data: { isCompanyNode: true } as EmployeeNodeData,
    })
    
    currentY += 80

    // 2. Hamiz (CEO) below company
    if (hamiz) {
      nodeList.push(createEmployeeNode(hamiz, centerX - CARD_WIDTH/2, currentY))
      edgeList.push(createEdge('company', hamiz.id, '#22C55E'))
    }

    currentY += CARD_HEIGHT + V_GAP

    // 3. Top-level partners row
    const partners = [richard, maryam, brad, daniyal].filter(Boolean) as User[]
    const partnerColors = ['#22C55E', '#EC4899', '#EF4444', '#F97316']
    const partnerStartX = centerX - ((partners.length * (CARD_WIDTH + DEPT_GAP)) / 2) + DEPT_GAP/2

    partners.forEach((partner, i) => {
      const x = partnerStartX + i * (CARD_WIDTH + DEPT_GAP)
      nodeList.push(createEmployeeNode(partner, x, currentY))
      if (hamiz) {
        edgeList.push(createEdge(hamiz.id, partner.id, partnerColors[i] || '#9CA3AF'))
      }
    })

    currentY += CARD_HEIGHT + V_GAP

    // 4. Department sections
    // Define department structure based on reference image
    const deptStructure = [
      { 
        name: '1to1Plans', 
        color: '#22C55E',
        parent: maryam,
        depts: ['1to1Plans']
      },
      {
        name: 'Design',
        color: '#3B82F6', 
        parent: hamiz,
        depts: ['Design', 'Product', 'Marketing', 'Software Engineering']
      },
      {
        name: 'Growth',
        color: '#A855F7',
        parent: hamiz,
        depts: ['Growth', 'Growth and strategy', 'IR', 'Research']
      },
      {
        name: 'Technology',
        color: '#F59E0B',
        parent: hamiz,
        depts: ['Technology', 'Quantitative Engineering', 'SOA']
      },
      {
        name: 'Operations',
        color: '#22C55E',
        parent: hamiz,
        depts: ['Operations', 'Accounting and Operations', 'Legal', 'Finance and Accounting']
      },
      {
        name: 'Human Resources',
        color: '#EC4899',
        parent: hamiz,
        depts: ['Human Resources']
      },
      {
        name: 'Operating Partners',
        color: '#EF4444',
        parent: brad,
        depts: ['Operating Partner-Value Creation', 'Operating Partner-Execution']
      }
    ]

    // Track positioned users
    const positioned = new Set<string>()
    if (hamiz) positioned.add(hamiz.id)
    partners.forEach(p => positioned.add(p.id))

    // Position each department section
    let deptX = 0
    const deptY = currentY

    deptStructure.forEach((section, sectionIdx) => {
      // Get all users in this section's departments
      const sectionUsers: User[] = []
      section.depts.forEach(deptName => {
        const deptUsers = byDept.get(deptName) || []
        deptUsers.forEach(u => {
          if (!positioned.has(u.id)) {
            sectionUsers.push(u)
            positioned.add(u.id)
          }
        })
      })

      if (sectionUsers.length === 0) return

      // Calculate section width
      const cols = Math.min(sectionUsers.length, 4)
      const rows = Math.ceil(sectionUsers.length / cols)
      const sectionWidth = cols * (CARD_WIDTH + H_GAP)

      // Position users in grid
      sectionUsers.forEach((user, idx) => {
        const col = idx % cols
        const row = Math.floor(idx / cols)
        const x = deptX + col * (CARD_WIDTH + H_GAP)
        const y = deptY + row * (CARD_HEIGHT + V_GAP/2)
        
        nodeList.push(createEmployeeNode(user, x, y))
        
        // Connect to manager
        const managerId = reportsTo.get(user.id)
        if (managerId && nodeList.find(n => n.id === managerId)) {
          edgeList.push(createEdge(managerId, user.id, section.color))
        } else if (section.parent) {
          edgeList.push(createEdge(section.parent.id, user.id, section.color))
        }
      })

      deptX += sectionWidth + DEPT_GAP * 2
    })

    // Position remaining unpositioned users at bottom
    const remaining = users.filter(u => !positioned.has(u.id))
    if (remaining.length > 0) {
      const bottomY = deptY + 400
      remaining.forEach((user, idx) => {
        const x = (idx % 8) * (CARD_WIDTH + H_GAP)
        const y = bottomY + Math.floor(idx / 8) * (CARD_HEIGHT + V_GAP/2)
        nodeList.push(createEmployeeNode(user, x, y))
      })
    }

    setNodes(nodeList)
    setEdges(edgeList)
    
    setTimeout(() => fitView({ padding: 0.1 }), 100)
  }, [users, mappings, fitView])

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    if (node.type === 'company' || node.type === 'deptLabel') return
    const userData = node.data as unknown as EmployeeNodeData
    if (userData.user) {
      setSelectedUser(userData.user)
      setIsDetailModalOpen(true)
    }
  }, [])

  // Handle drag and drop for reassignment
  const onNodeDragStop = useCallback((event: React.MouseEvent, node: Node, allNodes: Node[]) => {
    if (node.type !== 'employee') return
    
    const draggedData = node.data as unknown as EmployeeNodeData
    if (!draggedData.user) return
    
    // Find closest node above
    let closestManager: Node | null = null
    let minDistance = Infinity
    
    for (const n of allNodes) {
      if (n.id === node.id || n.type !== 'employee') continue
      const nData = n.data as unknown as EmployeeNodeData
      if (!nData.user) continue
      
      if (n.position.y < node.position.y - 50) {
        const dx = n.position.x - node.position.x
        const dy = n.position.y - node.position.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        
        if (distance < 200 && distance < minDistance) {
          minDistance = distance
          closestManager = n
        }
      }
    }
    
    if (closestManager) {
      const managerData = closestManager.data as unknown as EmployeeNodeData
      const currentManagerMapping = mappings.find(m => 
        m.evaluateeId === draggedData.user.id && 
        (m.relationshipType === 'TEAM_LEAD' || m.relationshipType === 'C_LEVEL')
      )
      const currentManager = currentManagerMapping?.evaluator || null
      
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
      
      await fetch('/api/admin/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evaluatorId: reassignData.newManager.id,
          evaluateeId: reassignData.employee.id,
          relationshipType,
        }),
      })
      
      toast.dismiss()
      toast.success(`${reassignData.employee.name} now reports to ${reassignData.newManager.name}`)
      setIsReassignModalOpen(false)
      loadData()
    } catch {
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
      <div className="min-h-screen flex items-center justify-center bg-[#FDF6E3]">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-emerald-500 animate-pulse" />
          <p className="text-slate-600 text-sm">Loading org chart...</p>
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
            <p className="text-muted mt-1">{users.length} employees • Click to view details • Drag to reassign</p>
          </div>
        </div>

        {/* Canvas with cream background like reference */}
        <div className="h-[calc(100vh-200px)] min-h-[600px] rounded-xl border border-slate-200 overflow-hidden shadow-lg" style={{ backgroundColor: '#FDF6E3' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onNodeDragStop={onNodeDragStop}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.1 }}
            minZoom={0.2}
            maxZoom={2}
            connectionMode={ConnectionMode.Loose}
            defaultEdgeOptions={{ type: 'smoothstep' }}
          >
            <Background variant={BackgroundVariant.Dots} gap={30} size={1} color="#E5DCC8" />
            <Controls showInteractive={false} />
            
            {/* Legend */}
            <Panel position="top-left" className="bg-white/95 rounded-xl shadow-lg p-4 border border-slate-200 backdrop-blur-sm">
              <div className="text-sm font-semibold text-slate-800 mb-3">Departments</div>
              <div className="grid gap-2 text-xs">
                {[
                  { name: '1to1Plans / Operations', color: '#22C55E' },
                  { name: 'Design / Product / Engineering', color: '#3B82F6' },
                  { name: 'Growth / Research / IR', color: '#A855F7' },
                  { name: 'Technology / QE', color: '#F59E0B' },
                  { name: 'Human Resources', color: '#EC4899' },
                  { name: 'Operating Partners', color: '#EF4444' },
                ].map(({ name, color }) => (
                  <div key={name} className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded" style={{ backgroundColor: color }} />
                    <span className="text-slate-600">{name}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-slate-200 text-[10px] text-slate-500">
                Drag employees to reassign managers
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
            <div className="flex items-center gap-4 p-4 rounded-xl" style={{ backgroundColor: getDeptColor(selectedUser.department, selectedUser.name).bg }}>
              <div 
                className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-semibold shadow-lg"
                style={{ backgroundColor: getDeptColor(selectedUser.department, selectedUser.name).border }}
              >
                {selectedUser.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
              <div>
                <h3 className="text-xl font-bold" style={{ color: getDeptColor(selectedUser.department, selectedUser.name).text }}>
                  {selectedUser.name}
                </h3>
                <p style={{ color: getDeptColor(selectedUser.department, selectedUser.name).text }} className="opacity-80">
                  {selectedUser.position || 'No position'}
                </p>
                <p className="text-sm opacity-60" style={{ color: getDeptColor(selectedUser.department, selectedUser.name).text }}>
                  {selectedUser.department || 'No department'}
                </p>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-500" />
                Evaluators ({selectedUserMappings.evaluators.length})
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
                          style={{ backgroundColor: getDeptColor(mapping.evaluator.department, mapping.evaluator.name).border }}
                        >
                          {mapping.evaluator.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <div className="font-medium text-foreground text-sm">{mapping.evaluator.name}</div>
                          <div className="text-xs text-muted">{mapping.evaluator.position}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs">
                          {RELATIONSHIP_TYPE_LABELS[mapping.relationshipType]}
                        </span>
                        <button 
                          onClick={() => handleDeleteMapping(mapping.id)}
                          className="p-1.5 text-muted hover:text-red-500 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <Link2 className="w-4 h-4 text-emerald-500" />
                Evaluates ({selectedUserMappings.evaluates.length})
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
                          style={{ backgroundColor: getDeptColor(mapping.evaluatee.department, mapping.evaluatee.name).border }}
                        >
                          {mapping.evaluatee.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <div className="font-medium text-foreground text-sm">{mapping.evaluatee.name}</div>
                          <div className="text-xs text-muted">{mapping.evaluatee.position}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-1 bg-emerald-100 text-emerald-700 rounded text-xs">
                          {RELATIONSHIP_TYPE_LABELS[mapping.relationshipType]}
                        </span>
                        <button 
                          onClick={() => handleDeleteMapping(mapping.id)}
                          className="p-1.5 text-muted hover:text-red-500 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Link
                href={`/admin/mappings?filterEmployee=${selectedUser.id}`}
                className="px-4 py-2 border border-border rounded-lg hover:bg-surface text-foreground text-sm flex items-center gap-2"
              >
                <ArrowUpRight className="w-4 h-4" />
                Edit Mappings
              </Link>
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reassign Modal */}
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
            
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm text-amber-800">
                This will update their evaluation mappings and weights automatically.
              </p>
            </div>
            
            <div className="flex justify-end gap-3 pt-4">
              <button
                onClick={() => setIsReassignModalOpen(false)}
                className="px-4 py-2 border border-border rounded-lg hover:bg-surface text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={handleReassign}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                Confirm
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
