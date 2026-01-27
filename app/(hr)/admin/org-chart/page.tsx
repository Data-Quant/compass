'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ReactFlow, { 
  Controls, 
  Background, 
  MiniMap,
  useNodesState, 
  useEdgesState,
  addEdge,
  Handle,
  Position,
  Node,
  Edge,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { PageHeader } from '@/components/layout/page-header'
import { PageFooter } from '@/components/layout/page-footer'
import { PageContainer, PageContent } from '@/components/layout/page-container'
import { RELATIONSHIP_TYPE_LABELS, RelationshipType } from '@/types'
import { Users, Link2, Trash2, ArrowUpRight, Building2, RotateCcw, Save } from 'lucide-react'
import { C_LEVEL_EVALUATORS, COMPANY_NAME } from '@/lib/config'

interface User {
  id: string
  name: string
  department: string | null
  position: string | null
  role: string
  chartX: number | null
  chartY: number | null
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
const COLORS: Record<string, string> = {
  green: '#22C55E',
  blue: '#3B82F6',
  purple: '#A855F7',
  pink: '#EC4899',
  yellow: '#EAB308',
  orange: '#F97316',
  red: '#EF4444',
  gray: '#94A3B8',
}

const DEPT_COLORS: Record<string, string> = {
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

function getColor(dept: string | null, name?: string): string {
  if (name) {
    const n = name.toLowerCase()
    if (n.includes('hamiz')) return 'green'
    if (n.includes('richard')) return 'green'
    if (n.includes('maryam')) return 'pink'
    if (n.includes('brad')) return 'red'
    if (n.includes('daniyal')) return 'orange'
  }
  return DEPT_COLORS[dept || ''] || 'gray'
}

// Custom Employee Node
function EmployeeNode({ data, selected }: { data: { name: string; title: string; color: string }; selected: boolean }) {
  const initials = data.name.split(' ').map(n => n[0]).join('').slice(0, 2)
  const borderColor = COLORS[data.color] || COLORS.gray
  
  return (
    <div 
      className={`employee-node ${selected ? 'selected' : ''}`}
      style={{ borderColor }}
    >
      <Handle type="target" position={Position.Top} style={{ background: '#94A3B8' }} />
      <div className="avatar" style={{ background: borderColor }}>{initials}</div>
      <div className="name">{data.name}</div>
      <div className="title">{data.title}</div>
      <Handle type="source" position={Position.Bottom} style={{ background: '#94A3B8' }} />
    </div>
  )
}

// Custom Company Node
function CompanyNode({ data }: { data: { name: string } }) {
  return (
    <div className="company-node">
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div className="logo"><Building2 className="w-5 h-5 text-white" /></div>
      <div className="name">{data.name}</div>
      <Handle type="source" position={Position.Bottom} style={{ background: '#94A3B8' }} />
    </div>
  )
}

const nodeTypes = {
  employee: EmployeeNode,
  company: CompanyNode,
}

export default function OrgChartPage() {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>([])
  const [mappings, setMappings] = useState<Mapping[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [reassignModal, setReassignModal] = useState<{ open: boolean; from: Node | null; to: Node | null }>({ open: false, from: null, to: null })

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

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

  // Build tree when data changes
  useEffect(() => {
    if (users.length === 0) return

    const newNodes: Node[] = []
    const newEdges: Edge[] = []
    const childrenMap = new Map<string, string[]>()
    const parentMap = new Map<string, string>()

    // Find Hamiz (CEO/root)
    const hamiz = users.find(u => u.name.toLowerCase().includes('hamiz'))
    
    // Find other C-Level executives (visual children of Hamiz, no evaluation mapping needed)
    const otherCLevel = users.filter(u => 
      C_LEVEL_EVALUATORS.some(name => u.name.toLowerCase() === name.toLowerCase()) &&
      !u.name.toLowerCase().includes('hamiz')
    )

    // Build parent/children maps from TEAM_LEAD and C_LEVEL mappings
    mappings
      .filter(m => m.relationshipType === 'TEAM_LEAD' || m.relationshipType === 'C_LEVEL')
      .forEach(m => {
        if (!parentMap.has(m.evaluateeId)) {
          parentMap.set(m.evaluateeId, m.evaluatorId)
          if (!childrenMap.has(m.evaluatorId)) childrenMap.set(m.evaluatorId, [])
          childrenMap.get(m.evaluatorId)!.push(m.evaluateeId)
        }
      })

    // VISUAL ONLY: Add C-Level executives as visual children of Hamiz (no evaluation mapping)
    if (hamiz) {
      if (!childrenMap.has(hamiz.id)) childrenMap.set(hamiz.id, [])
      otherCLevel.forEach(cLevel => {
        // Only add if not already connected via actual mapping
        if (!parentMap.has(cLevel.id)) {
          parentMap.set(cLevel.id, hamiz.id)
          childrenMap.get(hamiz.id)!.push(cLevel.id)
        }
      })
    }

    const rootUser = hamiz

    if (!rootUser) {
      setNodes([])
      setEdges([])
      return
    }

    // Layout constants - increased for better spacing
    const NODE_WIDTH = 180      // Width of each card
    const NODE_GAP = 30         // Horizontal gap between siblings
    const LEVEL_HEIGHT = 160    // Vertical distance between levels

    // Calculate subtree width with better spacing
    function getSubtreeWidth(userId: string): number {
      const children = childrenMap.get(userId) || []
      if (children.length === 0) return NODE_WIDTH
      const childrenWidth = children.reduce((sum, childId) => sum + getSubtreeWidth(childId), 0)
      const gaps = (children.length - 1) * NODE_GAP
      return childrenWidth + gaps
    }

    // Track which users are in tree
    const inTree = new Set<string>()

    // Position nodes recursively
    function positionNode(user: User, x: number, y: number, parentId?: string, isVisualOnly?: boolean) {
      inTree.add(user.id)
      const color = getColor(user.department, user.name)
      
      // Use saved position if available, otherwise use calculated position
      const finalX = user.chartX ?? x
      const finalY = user.chartY ?? y

      newNodes.push({
        id: user.id,
        type: 'employee',
        position: { x: finalX, y: finalY },
        data: { 
          name: user.name, 
          title: user.position || 'Employee',
          color,
          userId: user.id,
        },
        draggable: true,
      })

      if (parentId) {
        newEdges.push({
          id: `e${parentId}-${user.id}`,
          source: parentId,
          target: user.id,
          type: 'smoothstep',
          // Visual-only connections are dashed
          style: { 
            stroke: isVisualOnly ? '#CBD5E1' : '#94A3B8', 
            strokeWidth: 2,
            strokeDasharray: isVisualOnly ? '5,5' : undefined,
          },
        })
      }

      const children = childrenMap.get(user.id) || []
      if (children.length > 0) {
        const totalWidth = getSubtreeWidth(user.id)
        let currentX = x - totalWidth / 2

        children.forEach(childId => {
          const childUser = users.find(u => u.id === childId)
          if (childUser) {
            const childWidth = getSubtreeWidth(childId)
            const childX = currentX + childWidth / 2
            // Check if this is a visual-only connection (C-Level under Hamiz without actual mapping)
            const isChildVisualOnly = otherCLevel.some(c => c.id === childId) && 
              !mappings.some(m => m.evaluateeId === childId && m.evaluatorId === user.id && 
                (m.relationshipType === 'TEAM_LEAD' || m.relationshipType === 'C_LEVEL'))
            positionNode(childUser, childX, y + LEVEL_HEIGHT, user.id, isChildVisualOnly)
            currentX += childWidth + NODE_GAP
          }
        })
      }
    }

    // Calculate total tree width to center it
    const totalTreeWidth = getSubtreeWidth(rootUser.id)
    const treeCenter = Math.max(800, totalTreeWidth / 2 + 100)

    // Add company node
    newNodes.push({
      id: 'company',
      type: 'company',
      position: { x: treeCenter, y: 20 },
      data: { name: COMPANY_NAME },
      draggable: false,
    })

    // Add edge from company to root
    newEdges.push({
      id: `ecompany-${rootUser.id}`,
      source: 'company',
      target: rootUser.id,
      type: 'smoothstep',
      style: { stroke: '#94A3B8', strokeWidth: 2 },
    })

    // Build tree from root
    positionNode(rootUser, treeCenter, 180)

    // Add unassigned users in a neat grid on the right side
    const unassigned = users.filter(u => !inTree.has(u.id))
    if (unassigned.length > 0) {
      const COLS = 4 // 4 columns
      const CARD_WIDTH = 180
      const CARD_HEIGHT = 140
      const GAP_X = 30
      const GAP_Y = 40
      // Position to the right of the tree
      const startX = treeCenter + totalTreeWidth / 2 + 200
      const startY = 100
      
      // Add a label node for the unassigned section
      newNodes.push({
        id: 'unassigned-label',
        type: 'company',
        position: { x: startX + (COLS * (CARD_WIDTH + GAP_X)) / 2 - 100, y: startY - 60 },
        data: { name: `Unassigned (${unassigned.length})` },
        draggable: false,
      })
      
      unassigned.forEach((user, i) => {
        const col = i % COLS
        const row = Math.floor(i / COLS)
        const defaultX = startX + col * (CARD_WIDTH + GAP_X)
        const defaultY = startY + row * (CARD_HEIGHT + GAP_Y)
        const color = getColor(user.department, user.name)
        
        // Use saved position if available
        const finalX = user.chartX ?? defaultX
        const finalY = user.chartY ?? defaultY
        
        newNodes.push({
          id: user.id,
          type: 'employee',
          position: { x: finalX, y: finalY },
          data: { 
            name: user.name, 
            title: user.position || 'Unassigned',
            color,
            userId: user.id,
          },
          draggable: true,
        })
      })
    }

    setNodes(newNodes)
    setEdges(newEdges)
  }, [users, mappings, setNodes, setEdges])

  const onConnect = useCallback(
    (params: any) => setEdges((eds) => addEdge({ 
      ...params, 
      type: 'smoothstep', 
      style: { stroke: '#94A3B8', strokeWidth: 2 } 
    }, eds)),
    [setEdges]
  )

  const onNodeClick = useCallback((event: any, node: Node) => {
    if (node.type === 'company') return
    const user = users.find(u => u.id === node.id)
    if (user) {
      setSelectedUser(user)
      setIsDetailModalOpen(true)
    }
  }, [users])

  // Track pending position saves
  const pendingPositions = useRef<Map<string, { x: number; y: number }>>(new Map())
  const saveTimeout = useRef<NodeJS.Timeout | null>(null)

  const savePositions = useCallback(async () => {
    if (pendingPositions.current.size === 0) return
    
    const positions = Array.from(pendingPositions.current.entries()).map(([id, pos]) => ({
      id,
      x: pos.x,
      y: pos.y,
    }))
    
    pendingPositions.current.clear()
    
    try {
      await fetch('/api/admin/chart-positions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positions }),
      })
    } catch (error) {
      console.error('Failed to save positions:', error)
    }
  }, [])

  const queuePositionSave = useCallback((nodeId: string, x: number, y: number) => {
    pendingPositions.current.set(nodeId, { x, y })
    
    // Debounce - save after 1 second of no activity
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => {
      savePositions()
    }, 1000)
  }, [savePositions])

  const onNodeDragStop = useCallback((event: any, node: Node) => {
    if (node.type === 'company') return
    
    // Save the new position
    queuePositionSave(node.id, node.position.x, node.position.y)
    
    // Find closest node to drop on for reassignment
    const threshold = 150
    let closestNode: Node | null = null
    let closestDistance = Infinity

    nodes.forEach(n => {
      if (n.id !== node.id && n.type !== 'company') {
        const dx = n.position.x - node.position.x
        const dy = n.position.y - node.position.y
        const distance = Math.sqrt(dx * dx + dy * dy)

        if (distance < threshold && distance < closestDistance) {
          closestDistance = distance
          closestNode = n
        }
      }
    })

    if (closestNode) {
      setReassignModal({ open: true, from: node, to: closestNode })
    }
  }, [nodes, queuePositionSave])

  const resetAllPositions = useCallback(async () => {
    try {
      toast.loading('Resetting layout...')
      await fetch('/api/admin/chart-positions', { method: 'DELETE' })
      toast.dismiss()
      toast.success('Layout reset!')
      loadData() // Reload to get default positions
    } catch {
      toast.dismiss()
      toast.error('Failed to reset')
    }
  }, [])

  const handleReassign = async () => {
    if (!reassignModal.from || !reassignModal.to) return

    try {
      toast.loading('Updating...')
      
      const employeeId = reassignModal.from.id
      const newManagerId = reassignModal.to.id
      const isCLevel = C_LEVEL_EVALUATORS.some(n => 
        users.find(u => u.id === newManagerId)?.name.toLowerCase() === n.toLowerCase()
      )

      // Remove old TEAM_LEAD/C_LEVEL mapping
      const oldMapping = mappings.find(m => 
        m.evaluateeId === employeeId && 
        (m.relationshipType === 'TEAM_LEAD' || m.relationshipType === 'C_LEVEL')
      )
      if (oldMapping) {
        await fetch(`/api/admin/mappings?id=${oldMapping.id}`, { method: 'DELETE' })
      }

      // Create new mapping
      await fetch('/api/admin/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evaluatorId: newManagerId,
          evaluateeId: employeeId,
          relationshipType: isCLevel ? 'C_LEVEL' : 'TEAM_LEAD'
        }),
      })

      toast.dismiss()
      toast.success('Reassigned successfully!')
      setReassignModal({ open: false, from: null, to: null })
      loadData() // Reload to rebuild tree
    } catch {
      toast.dismiss()
      toast.error('Failed to reassign')
    }
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
      <PageContainer>
        <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#FDF6E3' }}>
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-emerald-500 animate-pulse" />
            <p className="text-slate-600">Loading organization...</p>
          </div>
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <style jsx global>{`
        .employee-node {
          background: white;
          border: 2px solid #22C55E;
          border-radius: 12px;
          padding: 12px;
          min-width: 140px;
          text-align: center;
          box-shadow: 0 4px 12px rgba(0,0,0,0.1);
          transition: all 0.2s ease;
          cursor: grab;
        }
        
        .employee-node:hover {
          transform: scale(1.05);
          box-shadow: 0 8px 24px rgba(0,0,0,0.15);
        }
        
        .employee-node:active {
          cursor: grabbing;
        }
        
        .employee-node .avatar {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: #22C55E;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          font-size: 16px;
          margin: 0 auto 8px;
        }
        
        .employee-node .name {
          font-weight: 600;
          font-size: 12px;
          color: #1E293B;
          margin-bottom: 2px;
        }
        
        .employee-node .title {
          font-size: 10px;
          color: #64748B;
        }
        
        .company-node {
          background: white;
          border: 2px solid #E2E8F0;
          border-radius: 16px;
          padding: 16px 24px;
          display: flex;
          align-items: center;
          gap: 12px;
          box-shadow: 0 4px 16px rgba(0,0,0,0.08);
        }
        
        .company-node .logo {
          width: 40px;
          height: 40px;
          background: linear-gradient(135deg, #22C55E, #16A34A);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .company-node .name {
          font-weight: 700;
          font-size: 18px;
          color: #1E293B;
        }
        
        .controls-panel {
          position: absolute;
          top: 80px;
          left: 20px;
          background: white;
          padding: 16px;
          border-radius: 12px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.1);
          z-index: 10;
        }
        
        .controls-panel h3 {
          font-size: 14px;
          margin-bottom: 12px;
          color: #1E293B;
        }
        
        .controls-panel p {
          font-size: 11px;
          color: #64748B;
          margin-top: 8px;
        }
        
        .info-panel {
          position: absolute;
          bottom: 20px;
          left: 20px;
          background: white;
          padding: 12px 16px;
          border-radius: 8px;
          box-shadow: 0 2px 12px rgba(0,0,0,0.1);
          font-size: 12px;
          color: #64748B;
          z-index: 10;
        }
      `}</style>
      
      <PageHeader backHref="/admin/mappings" backLabel="Mappings" badge="Org Chart" />
      
      <PageContent className="!max-w-none !px-0">
        <div style={{ width: '100%', height: 'calc(100vh - 140px)', background: '#FDF6E3' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onNodeDragStop={onNodeDragStop}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.2}
            maxZoom={2}
            defaultEdgeOptions={{
              type: 'smoothstep',
              style: { stroke: '#94A3B8', strokeWidth: 2 },
            }}
          >
            <Background color="#E2E8F0" gap={20} />
            <Controls />
            <MiniMap 
              nodeColor={(node) => {
                if (node.type === 'company') return '#E2E8F0'
                return COLORS[node.data?.color as string] || '#94A3B8'
              }}
              style={{ background: '#F8FAFC' }}
            />
          </ReactFlow>
          
          <div className="controls-panel">
            <h3>Org Chart</h3>
            <p>
              Drag employees to reorganize.<br/>
              Positions auto-save.
            </p>
            <button 
              onClick={resetAllPositions}
              className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reset Layout
            </button>
          </div>
          
          <div className="info-panel">
            {nodes.length} employees • {edges.length} connections
          </div>
        </div>
        
        <PageFooter />
      </PageContent>

      {/* Detail Modal */}
      <Modal isOpen={isDetailModalOpen} onClose={() => setIsDetailModalOpen(false)} title={selectedUser?.name || ''} size="lg">
        {selectedUser && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50">
              <div 
                className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold"
                style={{ background: COLORS[getColor(selectedUser.department, selectedUser.name)] }}
              >
                {selectedUser.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </div>
              <div>
                <h3 className="font-bold text-slate-800">{selectedUser.name}</h3>
                <p className="text-sm text-slate-600">{selectedUser.position} • {selectedUser.department}</p>
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
                      <button onClick={() => handleDeleteMapping(m.id)} className="p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 className="w-3 h-3" /></button>
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
                      <button onClick={() => handleDeleteMapping(m.id)} className="p-1 text-red-500 hover:bg-red-50 rounded"><Trash2 className="w-3 h-3" /></button>
                    </div>
                  </div>
                ))}
                {selectedUserMappings.evaluates.length === 0 && <p className="text-sm text-slate-500">None</p>}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Link href={`/admin/mappings?filterEmployee=${selectedUser.id}`} className="px-3 py-1.5 border rounded text-sm flex items-center gap-1 hover:bg-slate-50"><ArrowUpRight className="w-3 h-3" />All Mappings</Link>
              <button onClick={() => setIsDetailModalOpen(false)} className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700">Close</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reassign Modal */}
      <Modal isOpen={reassignModal.open} onClose={() => setReassignModal({ open: false, from: null, to: null })} title="Reassign Employee" size="sm">
        {reassignModal.from && reassignModal.to && (
          <div className="space-y-4">
            <p>Move <strong>{reassignModal.from.data?.name}</strong></p>
            <p>to report to <strong>{reassignModal.to.data?.name}</strong>?</p>
            <p className="text-sm text-slate-500">This will update their evaluation mappings.</p>
            <div className="flex justify-end gap-2 pt-2">
              <button 
                onClick={() => setReassignModal({ open: false, from: null, to: null })} 
                className="px-3 py-1.5 border rounded text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
              <button 
                onClick={handleReassign} 
                className="px-3 py-1.5 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700"
              >
                Confirm
              </button>
            </div>
          </div>
        )}
      </Modal>
    </PageContainer>
  )
}
