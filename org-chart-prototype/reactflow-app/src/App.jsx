import { useState, useCallback, useMemo } from 'react'
import ReactFlow, { 
  Controls, 
  Background, 
  MiniMap,
  useNodesState, 
  useEdgesState,
  addEdge,
  Handle,
  Position,
} from 'reactflow'
import 'reactflow/dist/style.css'

// Sample org data - matches your actual structure
const orgData = [
  { id: '1', name: 'Plutus 21', type: 'company' },
  { id: '2', name: 'Hamiz Awan', title: 'CEO', parent: '1', color: 'green' },
  { id: '3', name: 'Richard Reizes', title: 'Partner', parent: '2', color: 'green' },
  { id: '4', name: 'Brad Herman', title: 'Operating Partner - Value', parent: '2', color: 'red' },
  { id: '5', name: 'Daniyal Awan', title: 'Operating Partner - Exec', parent: '2', color: 'orange' },
  { id: '6', name: 'Maryam Khalil', title: 'HR', parent: '2', color: 'pink' },
  { id: '7', name: 'Muhammad Amir', title: 'Team Lead', parent: '2', color: 'blue' },
  { id: '8', name: 'Muhammad Tahir Sultan', title: 'Team Lead', parent: '2', color: 'purple' },
  { id: '9', name: 'Rohit Kumar', title: 'Developer', parent: '7', color: 'blue' },
  { id: '10', name: 'Naseer Ahmed', title: 'Developer', parent: '7', color: 'blue' },
  { id: '11', name: 'Sarah Smith', title: 'Designer', parent: '8', color: 'purple' },
  { id: '12', name: 'John Doe', title: 'Analyst', parent: '8', color: 'purple' },
  { id: '13', name: 'Emily Chen', title: 'Junior Dev', parent: '9', color: 'blue' },
  { id: '14', name: 'Alex Johnson', title: 'Operations', parent: '3', color: 'green' },
  { id: '15', name: 'Mike Wilson', title: 'Finance', parent: '3', color: 'green' },
]

// Custom Employee Node
function EmployeeNode({ data, selected }) {
  const initials = data.name.split(' ').map(n => n[0]).join('').slice(0, 2)
  
  return (
    <div className={`employee-node ${data.color || 'green'} ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} style={{ background: '#94A3B8' }} />
      <div className="avatar">{initials}</div>
      <div className="name">{data.name}</div>
      <div className="title">{data.title}</div>
      <Handle type="source" position={Position.Bottom} style={{ background: '#94A3B8' }} />
    </div>
  )
}

// Custom Company Node
function CompanyNode({ data }) {
  return (
    <div className="company-node">
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div className="logo">🏢</div>
      <div className="name">{data.name}</div>
      <Handle type="source" position={Position.Bottom} style={{ background: '#94A3B8' }} />
    </div>
  )
}

const nodeTypes = {
  employee: EmployeeNode,
  company: CompanyNode,
}

// Build tree structure and calculate positions
function buildTree(data) {
  const nodes = []
  const edges = []
  const childrenMap = new Map()
  
  // Build children map
  data.forEach(item => {
    if (item.parent) {
      if (!childrenMap.has(item.parent)) {
        childrenMap.set(item.parent, [])
      }
      childrenMap.get(item.parent).push(item.id)
    }
  })

  // Calculate subtree width
  function getSubtreeWidth(id) {
    const children = childrenMap.get(id) || []
    if (children.length === 0) return 160
    return children.reduce((sum, childId) => sum + getSubtreeWidth(childId), 0) + (children.length - 1) * 40
  }

  // Position nodes
  function positionNode(item, x, y, level) {
    const isCompany = item.type === 'company'
    
    nodes.push({
      id: item.id,
      type: isCompany ? 'company' : 'employee',
      position: { x, y },
      data: { 
        name: item.name, 
        title: item.title,
        color: item.color,
      },
      draggable: !isCompany,
    })

    if (item.parent) {
      edges.push({
        id: `e${item.parent}-${item.id}`,
        source: item.parent,
        target: item.id,
        type: 'smoothstep',
        animated: false,
        style: { stroke: '#94A3B8', strokeWidth: 2 },
      })
    }

    const children = childrenMap.get(item.id) || []
    if (children.length > 0) {
      const totalWidth = getSubtreeWidth(item.id)
      let currentX = x - totalWidth / 2
      
      children.forEach(childId => {
        const childItem = data.find(d => d.id === childId)
        const childWidth = getSubtreeWidth(childId)
        const childX = currentX + childWidth / 2
        positionNode(childItem, childX, y + 140, level + 1)
        currentX += childWidth + 40
      })
    }
  }

  // Start from company (root)
  const root = data.find(d => d.type === 'company')
  if (root) {
    positionNode(root, 600, 50, 0)
  }

  return { nodes, edges }
}

// Modal component
function Modal({ isOpen, onClose, title, children }) {
  if (!isOpen) return null
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  )
}

function App() {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => buildTree(orgData), [])
  
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [selectedNode, setSelectedNode] = useState(null)
  const [reassignModal, setReassignModal] = useState({ open: false, from: null, to: null })

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ 
      ...params, 
      type: 'smoothstep', 
      style: { stroke: '#94A3B8', strokeWidth: 2 } 
    }, eds)),
    [setEdges]
  )

  const onNodeClick = useCallback((event, node) => {
    setSelectedNode(node)
  }, [])

  const onNodeDragStop = useCallback((event, node) => {
    // Find closest node to drop on
    const threshold = 150
    let closestNode = null
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
  }, [nodes])

  const handleReassign = useCallback(() => {
    if (!reassignModal.from || !reassignModal.to) return
    
    // Remove old edge
    setEdges(eds => eds.filter(e => e.target !== reassignModal.from.id))
    
    // Add new edge
    setEdges(eds => [...eds, {
      id: `e${reassignModal.to.id}-${reassignModal.from.id}`,
      source: reassignModal.to.id,
      target: reassignModal.from.id,
      type: 'smoothstep',
      style: { stroke: '#94A3B8', strokeWidth: 2 },
    }])
    
    setReassignModal({ open: false, from: null, to: null })
  }, [reassignModal, setEdges])

  const autoLayout = useCallback(() => {
    const { nodes: newNodes, edges: newEdges } = buildTree(orgData)
    setNodes(newNodes)
    setEdges(newEdges)
  }, [setNodes, setEdges])

  return (
    <div style={{ width: '100%', height: '100%' }}>
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
            const colors = {
              green: '#22C55E',
              blue: '#3B82F6',
              purple: '#A855F7',
              pink: '#EC4899',
              yellow: '#EAB308',
              orange: '#F97316',
              red: '#EF4444',
            }
            return colors[node.data?.color] || '#94A3B8'
          }}
          style={{ background: '#F8FAFC' }}
        />
      </ReactFlow>
      
      <div className="controls-panel">
        <h3>Org Chart Controls</h3>
        <button onClick={autoLayout}>Reset Layout</button>
        <p style={{ fontSize: '11px', color: '#64748B', marginTop: '8px' }}>
          Drag employees to reorganize.<br/>
          Click to see details.
        </p>
      </div>
      
      <div className="info-panel">
        {selectedNode ? (
          <span>Selected: <strong>{selectedNode.data.name}</strong> - {selectedNode.data.title}</span>
        ) : (
          <span>Click a node to select</span>
        )}
      </div>

      <Modal 
        isOpen={reassignModal.open} 
        onClose={() => setReassignModal({ open: false, from: null, to: null })}
        title="Reassign Employee"
      >
        <p>Move <strong>{reassignModal.from?.data?.name}</strong></p>
        <p>to report to <strong>{reassignModal.to?.data?.name}</strong>?</p>
        <div className="modal-actions">
          <button 
            className="cancel" 
            onClick={() => setReassignModal({ open: false, from: null, to: null })}
          >
            Cancel
          </button>
          <button className="confirm" onClick={handleReassign}>
            Confirm
          </button>
        </div>
      </Modal>
    </div>
  )
}

export default App
