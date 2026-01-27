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

interface NodeData {
  user?: User
  label?: string
  color: string
  textColor: string
  borderColor: string
  [key: string]: unknown
}

// Colors
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

const DEPT_COLORS: Record<string, typeof COLORS.green> = {
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

function getColor(dept: string | null, name?: string): typeof COLORS.green {
  if (name) {
    const n = name.toLowerCase()
    if (n.includes('hamiz')) return COLORS.green
    if (n.includes('richard')) return COLORS.green
    if (n.includes('maryam')) return COLORS.pink
    if (n.includes('brad')) return COLORS.red
    if (n.includes('daniyal')) return COLORS.orange
  }
  return DEPT_COLORS[dept || ''] || COLORS.gray
}

// Company node
function CompanyNode() {
  return (
    <div className="px-6 py-3 bg-white rounded-xl shadow-lg border-2 border-slate-300 flex items-center gap-3">
      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow">
        <Building2 className="w-6 h-6 text-white" />
      </div>
      <span className="font-bold text-xl text-slate-800">{COMPANY_NAME}</span>
    </div>
  )
}

// Employee node
function EmployeeNode({ data, selected }: { data: NodeData; selected: boolean }) {
  const { user, color, textColor, borderColor } = data
  if (!user) return null
  const initials = user.name.split(' ').map(n => n[0]).join('').slice(0, 2)
  
  return (
    <div className={`${selected ? 'ring-2 ring-indigo-500 ring-offset-2' : ''}`}>
      <div 
        className="w-[130px] rounded-xl border-2 shadow-lg overflow-hidden cursor-pointer hover:shadow-xl transition-shadow"
        style={{ backgroundColor: color, borderColor }}
      >
        <div className="pt-3 pb-2 flex justify-center">
          <div 
            className="w-11 h-11 rounded-full flex items-center justify-center text-white text-sm font-bold shadow-md"
            style={{ backgroundColor: borderColor }}
          >
            {initials}
          </div>
        </div>
        <div className="px-2 pb-3 text-center">
          <div className="font-semibold text-[11px] leading-tight" style={{ color: textColor }}>
            {user.name}
          </div>
          <div className="text-[9px] mt-0.5 opacity-75" style={{ color: textColor }}>
            {user.position || 'Employee'}
          </div>
        </div>
      </div>
    </div>
  )
}

const nodeTypes = {
  company: CompanyNode,
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
  const [reassignData, setReassignData] = useState<{ employee: User | null; newManager: User | null; oldManager: User | null }>({ employee: null, newManager: null, oldManager: null })

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

  // Build tree layout
  useEffect(() => {
    if (users.length === 0) return

    const nodeList: Node[] = []
    const edgeList: Edge[] = []
    
    const CARD_W = 140
    const CARD_H = 100
    const H_GAP = 30
    const V_GAP = 80

    // Build parent-child relationships from mappings
    const childrenOf = new Map<string, string[]>() // parentId -> [childIds]
    const parentOf = new Map<string, string>() // childId -> parentId
    
    mappings
      .filter(m => m.relationshipType === 'TEAM_LEAD' || m.relationshipType === 'C_LEVEL')
      .forEach(m => {
        if (!parentOf.has(m.evaluateeId)) {
          parentOf.set(m.evaluateeId, m.evaluatorId)
          if (!childrenOf.has(m.evaluatorId)) childrenOf.set(m.evaluatorId, [])
          childrenOf.get(m.evaluatorId)!.push(m.evaluateeId)
        }
      })

    // Find C-Level people (roots)
    const cLevelUsers = users.filter(u => 
      C_LEVEL_EVALUATORS.some(name => u.name.toLowerCase() === name.toLowerCase())
    )
    
    const hamiz = cLevelUsers.find(u => u.name.toLowerCase().includes('hamiz'))
    const otherCLevel = cLevelUsers.filter(u => u.id !== hamiz?.id)

    // Create employee node
    const createNode = (user: User, x: number, y: number): Node => {
      const c = getColor(user.department, user.name)
      return {
        id: user.id,
        type: 'employee',
        position: { x, y },
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        data: { user, color: c.bg, textColor: c.text, borderColor: c.border } as NodeData,
      }
    }

    // Create edge with tree-style path
    const createEdge = (parentId: string, childId: string, color: string): Edge => ({
      id: `e-${parentId}-${childId}`,
      source: parentId,
      target: childId,
      type: 'smoothstep',
      style: { stroke: color, strokeWidth: 2 },
      animated: false,
    })

    // Track positions
    const positioned = new Set<string>()
    let centerX = 600

    // ===== COMPANY NODE =====
    nodeList.push({
      id: 'company',
      type: 'company',
      position: { x: centerX - 70, y: 0 },
      sourcePosition: Position.Bottom,
      targetPosition: Position.Top,
      data: {} as NodeData,
    })

    // ===== HAMIZ (Level 1) =====
    let currentY = V_GAP + 20
    if (hamiz) {
      nodeList.push(createNode(hamiz, centerX - CARD_W/2, currentY))
      edgeList.push(createEdge('company', hamiz.id, COLORS.green.border))
      positioned.add(hamiz.id)
    }

    // ===== OTHER C-LEVEL (Level 1, spread out) =====
    const level1Positions = [
      { x: 50, y: currentY },           // Far left (Richard)
      { x: 250, y: currentY },          // Left (Maryam)
      { x: centerX + 400, y: currentY }, // Right (Brad)
      { x: centerX + 600, y: currentY }, // Far right (Daniyal)
    ]
    
    otherCLevel.forEach((user, i) => {
      if (i < level1Positions.length) {
        nodeList.push(createNode(user, level1Positions[i].x, level1Positions[i].y))
        edgeList.push(createEdge('company', user.id, getColor(user.department, user.name).border))
        positioned.add(user.id)
      }
    })

    // ===== BUILD TREE RECURSIVELY =====
    const positionChildren = (parentId: string, parentX: number, parentY: number, depth: number) => {
      const children = (childrenOf.get(parentId) || []).filter(id => !positioned.has(id))
      if (children.length === 0) return 0

      const childY = parentY + V_GAP
      const totalWidth = children.length * (CARD_W + H_GAP) - H_GAP
      let startX = parentX - totalWidth / 2 + CARD_W / 2

      children.forEach((childId, i) => {
        const child = users.find(u => u.id === childId)
        if (!child) return

        const childX = startX + i * (CARD_W + H_GAP)
        const c = getColor(child.department, child.name)
        
        nodeList.push(createNode(child, childX, childY))
        edgeList.push(createEdge(parentId, childId, c.border))
        positioned.add(childId)

        // Recursively position grandchildren
        positionChildren(childId, childX, childY, depth + 1)
      })

      return totalWidth
    }

    // Position children of Hamiz
    if (hamiz) {
      positionChildren(hamiz.id, centerX, currentY, 1)
    }

    // Position children of other C-Level
    otherCLevel.forEach((cLevel, i) => {
      if (i < level1Positions.length) {
        positionChildren(cLevel.id, level1Positions[i].x + CARD_W/2, level1Positions[i].y, 1)
      }
    })

    // ===== UNPOSITIONED EMPLOYEES (at bottom) =====
    const remaining = users.filter(u => !positioned.has(u.id))
    if (remaining.length > 0) {
      const bottomY = 600
      const cols = 10
      remaining.forEach((user, i) => {
        const x = (i % cols) * (CARD_W + H_GAP/2)
        const y = bottomY + Math.floor(i / cols) * (CARD_H + H_GAP/2)
        nodeList.push(createNode(user, x, y))
        positioned.add(user.id)
      })
    }

    console.log('Nodes:', nodeList.length, 'Edges:', edgeList.length)
    setNodes(nodeList)
    setEdges(edgeList)
    
    setTimeout(() => fitView({ padding: 0.1 }), 200)
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
    
    let closest: Node | null = null
    let minDist = Infinity
    
    for (const n of allNodes) {
      if (n.id === node.id || n.type !== 'employee') continue
      const nData = n.data as unknown as NodeData
      if (!nData.user) continue
      if (n.position.y < node.position.y - 30) {
        const dist = Math.hypot(n.position.x - node.position.x, n.position.y - node.position.y)
        if (dist < 200 && dist < minDist) { minDist = dist; closest = n }
      }
    }
    
    if (closest) {
      const managerData = closest.data as unknown as NodeData
      if (!managerData.user) return
      const currentMapping = mappings.find(m => m.evaluateeId === draggedData.user!.id && (m.relationshipType === 'TEAM_LEAD' || m.relationshipType === 'C_LEVEL'))
      if (!currentMapping || currentMapping.evaluatorId !== managerData.user.id) {
        setReassignData({ employee: draggedData.user, newManager: managerData.user, oldManager: currentMapping?.evaluator || null })
        setIsReassignModalOpen(true)
      }
    }
  }, [mappings])

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
        body: JSON.stringify({ evaluatorId: reassignData.newManager.id, evaluateeId: reassignData.employee.id, relationshipType: isCLevel ? 'C_LEVEL' : 'TEAM_LEAD' }),
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F8F4EC' }}>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-emerald-500 animate-pulse" />
          <p className="text-slate-600">Loading...</p>
        </motion.div>
      </div>
    )
  }

  return (
    <>
      <PageHeader backHref="/admin/mappings" backLabel="Mappings" badge="Org Chart" />
      <PageContent className="!max-w-none !px-4">
        <div className="h-[calc(100vh-140px)] min-h-[600px] rounded-xl border border-slate-300 overflow-hidden shadow-xl" style={{ backgroundColor: '#F8F4EC' }}>
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
            maxZoom={1.5}
          >
            <Background variant={BackgroundVariant.Dots} gap={30} size={1} color="#D4CFC4" />
            <Controls showInteractive={false} />
            <Panel position="bottom-left" className="bg-white/95 rounded-lg shadow-lg p-3 border text-xs">
              <div className="font-semibold mb-2">Legend</div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { name: 'Ops/1to1', c: COLORS.green },
                  { name: 'Design/Prod', c: COLORS.blue },
                  { name: 'Growth/IR', c: COLORS.purple },
                  { name: 'Technology', c: COLORS.yellow },
                  { name: 'HR', c: COLORS.pink },
                  { name: 'Op Partners', c: COLORS.red },
                ].map(({ name, c }) => (
                  <div key={name} className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: c.border }} />
                    <span className="text-slate-600">{name}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 pt-2 border-t text-[10px] text-slate-500">Drag to reassign • Click to view</div>
            </Panel>
          </ReactFlow>
        </div>
        <PageFooter />
      </PageContent>

      {/* Detail Modal */}
      <Modal isOpen={isDetailModalOpen} onClose={() => setIsDetailModalOpen(false)} title={selectedUser?.name || ''} size="lg">
        {selectedUser && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: getColor(selectedUser.department, selectedUser.name).bg }}>
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold" style={{ backgroundColor: getColor(selectedUser.department, selectedUser.name).border }}>
                {selectedUser.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
              <div>
                <h3 className="font-bold" style={{ color: getColor(selectedUser.department, selectedUser.name).text }}>{selectedUser.name}</h3>
                <p className="text-sm opacity-80" style={{ color: getColor(selectedUser.department, selectedUser.name).text }}>{selectedUser.position} • {selectedUser.department}</p>
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
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Link href={`/admin/mappings?filterEmployee=${selectedUser.id}`} className="px-3 py-1.5 border rounded text-sm flex items-center gap-1"><ArrowUpRight className="w-3 h-3" />Edit</Link>
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
            <div className="flex justify-end gap-2">
              <button onClick={() => setIsReassignModalOpen(false)} className="px-3 py-1.5 border rounded text-sm">Cancel</button>
              <button onClick={handleReassign} className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm flex items-center gap-1"><Save className="w-3 h-3" />Confirm</button>
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
