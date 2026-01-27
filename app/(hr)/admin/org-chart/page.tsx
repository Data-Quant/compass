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

interface NodeData {
  user?: User
  label?: string
  color: string
  textColor: string
  borderColor: string
  nodeType: 'company' | 'employee' | 'deptLabel'
  [key: string]: unknown
}

// Color scheme matching reference exactly
const COLORS = {
  green: { bg: '#86EFAC', border: '#22C55E', text: '#14532D' },
  pink: { bg: '#F9A8D4', border: '#EC4899', text: '#831843' },
  blue: { bg: '#93C5FD', border: '#3B82F6', text: '#1E3A8A' },
  purple: { bg: '#D8B4FE', border: '#A855F7', text: '#581C87' },
  yellow: { bg: '#FDE68A', border: '#F59E0B', text: '#78350F' },
  red: { bg: '#FCA5A5', border: '#EF4444', text: '#7F1D1D' },
  orange: { bg: '#FDBA74', border: '#F97316', text: '#7C2D12' },
  gray: { bg: '#E5E7EB', border: '#9CA3AF', text: '#374151' },
}

// Department to color mapping
const DEPT_COLOR_MAP: Record<string, typeof COLORS.green> = {
  '1to1Plans': COLORS.green,
  'Design': COLORS.blue,
  'Product': COLORS.blue,
  'Marketing': COLORS.blue,
  'Software Engineering': COLORS.blue,
  'Growth': COLORS.purple,
  'Growth and strategy': COLORS.purple,
  'IR': COLORS.purple,
  'Research': COLORS.purple,
  'Quantitative Engineering': COLORS.yellow,
  'Technology': COLORS.yellow,
  'SOA': COLORS.yellow,
  'Operations': COLORS.green,
  'Accounting and Operations': COLORS.green,
  'Legal': COLORS.green,
  'Finance and Accounting': COLORS.green,
  'Human Resources': COLORS.pink,
  'Operating Partner-Value Creation': COLORS.red,
  'Operating Partner-Execution': COLORS.orange,
  'Executive': COLORS.green,
}

function getColor(dept: string | null, personName?: string): typeof COLORS.green {
  // Special colors for specific people
  if (personName) {
    const name = personName.toLowerCase()
    if (name.includes('hamiz')) return COLORS.green
    if (name.includes('richard')) return COLORS.green
    if (name.includes('maryam')) return COLORS.pink
    if (name.includes('brad')) return COLORS.red
    if (name.includes('daniyal')) return COLORS.orange
  }
  if (!dept) return COLORS.gray
  return DEPT_COLOR_MAP[dept] || COLORS.gray
}

// Company logo node
function CompanyNode() {
  return (
    <div className="px-5 py-2.5 bg-white rounded-lg shadow-md border border-slate-200 flex items-center gap-2">
      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
        <Building2 className="w-4 h-4 text-white" />
      </div>
      <span className="font-bold text-base text-slate-800">{COMPANY_NAME}</span>
    </div>
  )
}

// Department label node
function DeptLabelNode({ data }: { data: NodeData }) {
  return (
    <div className="px-3 py-1 text-[11px] font-medium text-slate-600 bg-white/80 rounded border border-slate-200 shadow-sm">
      {data.label}
    </div>
  )
}

// Employee card node
function EmployeeNode({ data, selected, dragging }: { data: NodeData; selected: boolean; dragging: boolean }) {
  const { user, color, textColor, borderColor } = data
  if (!user) return null
  
  const initials = user.name.split(' ').map(n => n[0]).join('').slice(0, 2)
  
  return (
    <div className={`transition-transform ${dragging ? 'scale-105' : ''} ${selected ? 'ring-2 ring-indigo-500 ring-offset-2' : ''}`}>
      <div 
        className="w-[120px] rounded-lg border-2 shadow-md overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
        style={{ backgroundColor: color, borderColor }}
      >
        <div className="pt-2.5 pb-1.5 flex justify-center">
          <div 
            className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold shadow"
            style={{ backgroundColor: borderColor }}
          >
            {initials}
          </div>
        </div>
        <div className="px-1.5 pb-2 text-center">
          <div className="font-semibold text-[10px] leading-tight" style={{ color: textColor }}>
            {user.name}
          </div>
          <div className="text-[8px] mt-0.5 opacity-75 leading-tight" style={{ color: textColor }}>
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

  // Build exact org chart matching reference
  useEffect(() => {
    if (users.length === 0) return

    const nodeList: Node[] = []
    const edgeList: Edge[] = []
    
    // Layout constants
    const CARD_W = 120
    const CARD_H = 85
    const H_GAP = 15
    const V_GAP = 50
    const SECTION_GAP = 60

    // Helper functions
    const createNode = (id: string, type: 'company' | 'employee' | 'deptLabel', x: number, y: number, data: Partial<NodeData>): Node => ({
      id,
      type,
      position: { x, y },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      draggable: type === 'employee',
      data: { ...data, nodeType: type } as NodeData,
    })

    const createEdge = (source: string, target: string, color: string): Edge => ({
      id: `${source}-${target}`,
      source,
      target,
      type: 'smoothstep',
      style: { stroke: color, strokeWidth: 2 },
    })

    const createEmployeeNode = (user: User, x: number, y: number): Node => {
      const c = getColor(user.department, user.name)
      return createNode(user.id, 'employee', x, y, {
        user,
        color: c.bg,
        textColor: c.text,
        borderColor: c.border,
      })
    }

    // Find key people
    const hamiz = users.find(u => u.name.toLowerCase().includes('hamiz'))
    const richard = users.find(u => u.name.toLowerCase().includes('richard'))
    const maryam = users.find(u => u.name.toLowerCase().includes('maryam'))
    const brad = users.find(u => u.name.toLowerCase().includes('brad'))
    const daniyal = users.find(u => u.name.toLowerCase().includes('daniyal'))

    // Build reporting relationships from mappings
    const reportsTo = new Map<string, string>()
    mappings
      .filter(m => m.relationshipType === 'TEAM_LEAD' || m.relationshipType === 'C_LEVEL')
      .forEach(m => {
        if (!reportsTo.has(m.evaluateeId)) {
          reportsTo.set(m.evaluateeId, m.evaluatorId)
        }
      })

    // Group users by department
    const byDept = new Map<string, User[]>()
    users.forEach(u => {
      const dept = u.department || 'Other'
      if (!byDept.has(dept)) byDept.set(dept, [])
      byDept.get(dept)!.push(u)
    })

    // Track positioned users
    const positioned = new Set<string>()
    
    // ============ LAYOUT ============
    // Reference structure (left to right):
    // [Richard/1to1Plans] [Maryam] | [Design] [Growth] [Product] [Technology] [Operations] [HR] | [Brad/Daniyal/Operating Partners]
    //                              |                    HAMIZ (center)                          |

    let currentX = 0
    const topY = 0
    const level1Y = 80
    const level2Y = 160
    const level3Y = 240
    const level4Y = 320
    const level5Y = 400

    // ===== COMPANY NODE =====
    const companyX = 900
    nodeList.push(createNode('company', 'company', companyX, topY, { color: '', textColor: '', borderColor: '' }))

    // ===== HAMIZ (Center) =====
    if (hamiz) {
      nodeList.push(createEmployeeNode(hamiz, companyX - 10, level1Y))
      edgeList.push(createEdge('company', hamiz.id, COLORS.green.border))
      positioned.add(hamiz.id)
    }

    // ===== LEFT SIDE: Richard & 1to1Plans =====
    currentX = 0
    
    if (richard) {
      nodeList.push(createEmployeeNode(richard, currentX, level1Y))
      edgeList.push(createEdge('company', richard.id, COLORS.green.border))
      positioned.add(richard.id)
      
      // 1to1Plans label
      nodeList.push(createNode('label-1to1plans', 'deptLabel', currentX + 20, level2Y - 25, { label: '1to1Plans', color: '', textColor: '', borderColor: '' }))
    }

    // 1to1Plans team under Richard
    const oneto1Team = (byDept.get('1to1Plans') || []).filter(u => !positioned.has(u.id))
    oneto1Team.forEach((u, i) => {
      const x = currentX + (i % 4) * (CARD_W + H_GAP)
      const y = level2Y + Math.floor(i / 4) * (CARD_H + H_GAP)
      nodeList.push(createEmployeeNode(u, x, y))
      if (richard) edgeList.push(createEdge(richard.id, u.id, COLORS.green.border))
      positioned.add(u.id)
    })
    currentX += Math.max(4, oneto1Team.length) * (CARD_W + H_GAP) + SECTION_GAP

    // ===== MARYAM =====
    if (maryam) {
      nodeList.push(createEmployeeNode(maryam, currentX, level1Y))
      edgeList.push(createEdge('company', maryam.id, COLORS.pink.border))
      positioned.add(maryam.id)
      
      // Get Maryam's direct reports
      const maryamReports = users.filter(u => reportsTo.get(u.id) === maryam.id && !positioned.has(u.id))
      maryamReports.forEach((u, i) => {
        const x = currentX + (i % 3) * (CARD_W + H_GAP)
        const y = level2Y + Math.floor(i / 3) * (CARD_H + H_GAP)
        nodeList.push(createEmployeeNode(u, x, y))
        edgeList.push(createEdge(maryam.id, u.id, COLORS.green.border))
        positioned.add(u.id)
      })
      currentX += Math.max(3, maryamReports.length) * (CARD_W + H_GAP) + SECTION_GAP
    }

    // ===== MAIN DEPARTMENTS UNDER HAMIZ =====
    const mainDepts = [
      { name: 'Design', depts: ['Design'], color: COLORS.blue },
      { name: 'Marketing', depts: ['Marketing'], color: COLORS.blue },
      { name: 'Product', depts: ['Product'], color: COLORS.blue },
      { name: 'Software Engineering', depts: ['Software Engineering'], color: COLORS.blue },
      { name: 'Growth', depts: ['Growth', 'Growth and strategy'], color: COLORS.purple, sub: [
        { name: 'Growth & Investor Relations', depts: ['IR'], color: COLORS.purple },
        { name: 'Research', depts: ['Research'], color: COLORS.purple },
      ]},
      { name: 'Technology', depts: ['Technology'], color: COLORS.yellow, sub: [
        { name: 'Quantitative Engineering', depts: ['Quantitative Engineering'], color: COLORS.yellow },
        { name: 'Software Engineering', depts: [], color: COLORS.yellow },
        { name: 'SOA', depts: ['SOA'], color: COLORS.yellow },
      ]},
      { name: 'Operations', depts: ['Operations', 'Accounting and Operations'], color: COLORS.green, sub: [
        { name: 'Legal', depts: ['Legal'], color: COLORS.green },
        { name: 'Operations', depts: [], color: COLORS.green },
        { name: 'Finance and Accounting', depts: ['Finance and Accounting'], color: COLORS.green },
      ]},
      { name: 'Human Resources', depts: ['Human Resources'], color: COLORS.pink },
    ]

    mainDepts.forEach(section => {
      // Section label
      nodeList.push(createNode(`label-${section.name}`, 'deptLabel', currentX + 30, level2Y - 25, { label: section.name, color: '', textColor: '', borderColor: '' }))
      
      // Get users for this section
      const sectionUsers: User[] = []
      section.depts.forEach(d => {
        const deptUsers = (byDept.get(d) || []).filter(u => !positioned.has(u.id))
        sectionUsers.push(...deptUsers)
      })

      // Position section lead (if any) at top
      const lead = sectionUsers.find(u => 
        u.position?.toLowerCase().includes('lead') || 
        u.position?.toLowerCase().includes('principal') ||
        u.position?.toLowerCase().includes('manager') ||
        u.position?.toLowerCase().includes('director')
      )
      
      let teamStartY = level2Y
      if (lead) {
        nodeList.push(createEmployeeNode(lead, currentX, level2Y))
        if (hamiz) edgeList.push(createEdge(hamiz.id, lead.id, section.color.border))
        positioned.add(lead.id)
        teamStartY = level3Y
      }

      // Position team members
      const team = sectionUsers.filter(u => u.id !== lead?.id)
      team.forEach((u, i) => {
        const x = currentX + (i % 3) * (CARD_W + H_GAP)
        const y = teamStartY + Math.floor(i / 3) * (CARD_H + H_GAP)
        nodeList.push(createEmployeeNode(u, x, y))
        if (lead) {
          edgeList.push(createEdge(lead.id, u.id, section.color.border))
        } else if (hamiz) {
          edgeList.push(createEdge(hamiz.id, u.id, section.color.border))
        }
        positioned.add(u.id)
      })

      // Handle sub-sections
      if (section.sub) {
        let subX = currentX
        section.sub.forEach(sub => {
          // Sub-section label
          nodeList.push(createNode(`label-${section.name}-${sub.name}`, 'deptLabel', subX + 10, level3Y - 25, { label: sub.name, color: '', textColor: '', borderColor: '' }))
          
          const subUsers = sub.depts.flatMap(d => (byDept.get(d) || []).filter(u => !positioned.has(u.id)))
          subUsers.forEach((u, i) => {
            const x = subX + (i % 2) * (CARD_W + H_GAP)
            const y = level3Y + Math.floor(i / 2) * (CARD_H + H_GAP)
            nodeList.push(createEmployeeNode(u, x, y))
            if (lead) edgeList.push(createEdge(lead.id, u.id, sub.color.border))
            positioned.add(u.id)
          })
          subX += Math.max(2, subUsers.length) * (CARD_W + H_GAP) + H_GAP
        })
      }

      currentX += Math.max(3, team.length, section.sub?.length || 0) * (CARD_W + H_GAP) + SECTION_GAP
    })

    // ===== RIGHT SIDE: Brad, Daniyal & Operating Partners =====
    // Brad
    if (brad) {
      nodeList.push(createEmployeeNode(brad, currentX, level1Y))
      edgeList.push(createEdge('company', brad.id, COLORS.red.border))
      positioned.add(brad.id)
      
      // Operating Partners label
      nodeList.push(createNode('label-op-value', 'deptLabel', currentX, level2Y - 25, { label: 'Operating Partners (Value Creation)', color: '', textColor: '', borderColor: '' }))
    }

    currentX += CARD_W + SECTION_GAP

    // Daniyal
    if (daniyal) {
      nodeList.push(createEmployeeNode(daniyal, currentX, level1Y))
      edgeList.push(createEdge('company', daniyal.id, COLORS.orange.border))
      positioned.add(daniyal.id)
    }

    // Operating Partners team
    const opTeam = [
      ...(byDept.get('Operating Partner-Value Creation') || []),
      ...(byDept.get('Operating Partner-Execution') || []),
    ].filter(u => !positioned.has(u.id))
    
    const opStartX = brad ? currentX - CARD_W - SECTION_GAP : currentX
    opTeam.forEach((u, i) => {
      const x = opStartX + (i % 4) * (CARD_W + H_GAP)
      const y = level2Y + Math.floor(i / 4) * (CARD_H + H_GAP)
      const c = getColor(u.department, u.name)
      nodeList.push(createEmployeeNode(u, x, y))
      if (brad) edgeList.push(createEdge(brad.id, u.id, c.border))
      positioned.add(u.id)
    })

    // ===== REMAINING UNPOSITIONED USERS =====
    const remaining = users.filter(u => !positioned.has(u.id))
    if (remaining.length > 0) {
      const bottomY = level5Y + 100
      nodeList.push(createNode('label-other', 'deptLabel', 0, bottomY - 25, { label: 'Other Employees', color: '', textColor: '', borderColor: '' }))
      remaining.forEach((u, i) => {
        const x = (i % 10) * (CARD_W + H_GAP)
        const y = bottomY + Math.floor(i / 10) * (CARD_H + H_GAP)
        nodeList.push(createEmployeeNode(u, x, y))
      })
    }

    setNodes(nodeList)
    setEdges(edgeList)
    
    setTimeout(() => fitView({ padding: 0.05 }), 100)
  }, [users, mappings, fitView])

  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
    if (node.type !== 'employee') return
    const data = node.data as unknown as NodeData
    if (data.user) {
      setSelectedUser(data.user)
      setIsDetailModalOpen(true)
    }
  }, [])

  const onNodeDragStop = useCallback((event: React.MouseEvent, node: Node, allNodes: Node[]) => {
    if (node.type !== 'employee') return
    const draggedData = node.data as unknown as NodeData
    if (!draggedData.user) return
    
    let closestManager: Node | null = null
    let minDistance = Infinity
    
    for (const n of allNodes) {
      if (n.id === node.id || n.type !== 'employee') continue
      const nData = n.data as unknown as NodeData
      if (!nData.user) continue
      
      if (n.position.y < node.position.y - 40) {
        const dx = n.position.x - node.position.x
        const dy = n.position.y - node.position.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        
        if (distance < 180 && distance < minDistance) {
          minDistance = distance
          closestManager = n
        }
      }
    }
    
    if (closestManager) {
      const managerData = closestManager.data as unknown as NodeData
      if (!managerData.user) return
      
      const currentMapping = mappings.find(m => 
        m.evaluateeId === draggedData.user!.id && 
        (m.relationshipType === 'TEAM_LEAD' || m.relationshipType === 'C_LEVEL')
      )
      const currentManager = currentMapping?.evaluator || null
      
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
      toast.loading('Updating...')
      
      const isCLevel = C_LEVEL_EVALUATORS.some(name => 
        reassignData.newManager!.name.toLowerCase() === name.toLowerCase()
      )
      
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
          relationshipType: isCLevel ? 'C_LEVEL' : 'TEAM_LEAD',
        }),
      })
      
      toast.dismiss()
      toast.success(`${reassignData.employee.name} now reports to ${reassignData.newManager.name}`)
      setIsReassignModalOpen(false)
      loadData()
    } catch {
      toast.dismiss()
      toast.error('Failed to update')
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
      else { toast.success('Deleted'); loadData() }
    } catch { toast.error('Failed') }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FDF6E3' }}>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-emerald-500 animate-pulse" />
          <p className="text-slate-600 text-sm">Loading...</p>
        </motion.div>
      </div>
    )
  }

  return (
    <>
      <PageHeader backHref="/admin/mappings" backLabel="Mappings" badge="Org Chart" />
      
      <PageContent className="!max-w-none !px-4">
        <div className="h-[calc(100vh-160px)] min-h-[600px] rounded-xl border border-slate-200 overflow-hidden shadow-lg" style={{ backgroundColor: '#FDF6E3' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onNodeDragStop={onNodeDragStop}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.05 }}
            minZoom={0.1}
            maxZoom={2}
            connectionMode={ConnectionMode.Loose}
            defaultEdgeOptions={{ type: 'smoothstep' }}
          >
            <Background variant={BackgroundVariant.Dots} gap={25} size={1} color="#E5DCC8" />
            <Controls showInteractive={false} />
            
            <Panel position="bottom-left" className="bg-white/90 rounded-lg shadow-md p-3 border border-slate-200 text-xs">
              <div className="font-semibold mb-2 text-slate-700">Legend</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {[
                  { name: '1to1Plans/Ops', ...COLORS.green },
                  { name: 'Design/Product', ...COLORS.blue },
                  { name: 'Growth/IR', ...COLORS.purple },
                  { name: 'Technology', ...COLORS.yellow },
                  { name: 'HR', ...COLORS.pink },
                  { name: 'Op Partners', ...COLORS.red },
                ].map(({ name, border }) => (
                  <div key={name} className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: border }} />
                    <span className="text-slate-600">{name}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 pt-2 border-t border-slate-200 text-[10px] text-slate-500">
                Drag to reassign • Click to view
              </div>
            </Panel>
          </ReactFlow>
        </div>
        <PageFooter />
      </PageContent>

      {/* Detail Modal */}
      <Modal isOpen={isDetailModalOpen} onClose={() => setIsDetailModalOpen(false)} title={selectedUser?.name || ''} size="lg">
        {selectedUser && (
          <div className="space-y-5">
            <div className="flex items-center gap-4 p-4 rounded-xl" style={{ backgroundColor: getColor(selectedUser.department, selectedUser.name).bg }}>
              <div 
                className="w-14 h-14 rounded-full flex items-center justify-center text-white text-lg font-bold shadow"
                style={{ backgroundColor: getColor(selectedUser.department, selectedUser.name).border }}
              >
                {selectedUser.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
              <div>
                <h3 className="text-lg font-bold" style={{ color: getColor(selectedUser.department, selectedUser.name).text }}>{selectedUser.name}</h3>
                <p className="text-sm opacity-80" style={{ color: getColor(selectedUser.department, selectedUser.name).text }}>{selectedUser.position}</p>
                <p className="text-xs opacity-60" style={{ color: getColor(selectedUser.department, selectedUser.name).text }}>{selectedUser.department}</p>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2"><Users className="w-4 h-4 text-indigo-500" />Evaluators ({selectedUserMappings.evaluators.length})</h4>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {selectedUserMappings.evaluators.map(m => (
                  <div key={m.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-medium" style={{ backgroundColor: getColor(m.evaluator.department, m.evaluator.name).border }}>
                        {m.evaluator.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div>
                        <div className="font-medium text-xs">{m.evaluator.name}</div>
                        <div className="text-[10px] text-slate-500">{m.evaluator.position}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[10px]">{RELATIONSHIP_TYPE_LABELS[m.relationshipType]}</span>
                      <button onClick={() => handleDeleteMapping(m.id)} className="p-1 text-slate-400 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </div>
                ))}
                {selectedUserMappings.evaluators.length === 0 && <p className="text-xs text-slate-500 py-2">No evaluators</p>}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2"><Link2 className="w-4 h-4 text-emerald-500" />Evaluates ({selectedUserMappings.evaluates.length})</h4>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {selectedUserMappings.evaluates.map(m => (
                  <div key={m.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-medium" style={{ backgroundColor: getColor(m.evaluatee.department, m.evaluatee.name).border }}>
                        {m.evaluatee.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </div>
                      <div>
                        <div className="font-medium text-xs">{m.evaluatee.name}</div>
                        <div className="text-[10px] text-slate-500">{m.evaluatee.position}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-[10px]">{RELATIONSHIP_TYPE_LABELS[m.relationshipType]}</span>
                      <button onClick={() => handleDeleteMapping(m.id)} className="p-1 text-slate-400 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </div>
                ))}
                {selectedUserMappings.evaluates.length === 0 && <p className="text-xs text-slate-500 py-2">Not evaluating anyone</p>}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t">
              <Link href={`/admin/mappings?filterEmployee=${selectedUser.id}`} className="px-3 py-1.5 border rounded-lg text-xs flex items-center gap-1 hover:bg-slate-50">
                <ArrowUpRight className="w-3 h-3" />Edit
              </Link>
              <button onClick={() => setIsDetailModalOpen(false)} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs">Close</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reassign Modal */}
      <Modal isOpen={isReassignModalOpen} onClose={() => setIsReassignModalOpen(false)} title="Reassign" size="sm">
        {reassignData.employee && reassignData.newManager && (
          <div className="space-y-4">
            <p className="text-sm">Move <strong>{reassignData.employee.name}</strong> to report to <strong>{reassignData.newManager.name}</strong>?</p>
            {reassignData.oldManager && <p className="text-xs text-slate-500">Currently: {reassignData.oldManager.name}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setIsReassignModalOpen(false)} className="px-3 py-1.5 border rounded-lg text-xs">Cancel</button>
              <button onClick={handleReassign} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs flex items-center gap-1"><Save className="w-3 h-3" />Confirm</button>
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
