'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  type Edge as FlowEdge,
  type Node as FlowNode,
  type NodeProps,
  type ReactFlowInstance,
  useEdgesState,
  useNodesState,
} from 'reactflow'
import 'reactflow/dist/style.css'
import {
  Building2,
  GitBranch,
  Link2,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { COMPANY_NAME } from '@/lib/config'
import {
  buildFocusedOrgChartScene,
  buildHierarchyOrgChartScene,
  buildOverviewOrgChartScene,
  ORG_CHART_EDGE_COLORS,
  ORG_CHART_EDGE_LABELS,
  type OrgChartMapping,
  type OrgChartMeta,
  type OrgChartUser,
} from '@/lib/org-chart'
import { RELATIONSHIP_TYPE_LABELS, type RelationshipType } from '@/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'

type ViewMode = 'focused' | 'overview' | 'hierarchy'
type OrgChartApiResponse = { users: OrgChartUser[]; mappings: OrgChartMapping[]; meta: OrgChartMeta }
type OrgChartNodeData = { label: string; subtitle: string; color: string; department: string | null; userId?: string }
type MappingFormState = { evaluatorId: string; evaluateeId: string; relationshipType: RelationshipType }

const GRAPH_TYPES: RelationshipType[] = ['TEAM_LEAD', 'DIRECT_REPORT', 'PEER', 'HR', 'C_LEVEL', 'DEPT']
const EMPTY_META: OrgChartMeta = {
  topLevelLeaderIds: [],
  isolatedUserIds: [],
  relationshipCounts: {
    TEAM_LEAD: 0,
    DIRECT_REPORT: 0,
    PEER: 0,
    HR: 0,
    C_LEVEL: 0,
    DEPT: 0,
    CROSS_DEPARTMENT: 0,
    SELF: 0,
  },
}
const DEFAULT_FORM: MappingFormState = { evaluatorId: '', evaluateeId: '', relationshipType: 'TEAM_LEAD' }

const DEPARTMENT_COLORS: Record<string, string> = {
  Executive: '#22C55E',
  'Operating Partner-Value Creation': '#EF4444',
  'Operating Partner-Execution': '#F97316',
  'Human Resources': '#EC4899',
  Technology: '#EAB308',
  'Quantitative Engineering': '#EAB308',
  'Software Engineering': '#3B82F6',
  Product: '#3B82F6',
  Marketing: '#8B5CF6',
  Research: '#8B5CF6',
  Operations: '#10B981',
  'Finance and Accounting': '#10B981',
}

function sortUsersByName(users: OrgChartUser[]) {
  return [...users].sort(
    (left, right) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }) ||
      left.id.localeCompare(right.id)
  )
}

function getUserColor(user: OrgChartUser) {
  const name = user.name.toLowerCase()
  if (name.includes('hamiz')) return '#22C55E'
  if (name.includes('brad')) return '#EF4444'
  if (name.includes('daniyal')) return '#F97316'
  if (name.includes('maryam')) return '#EC4899'
  return DEPARTMENT_COLORS[user.department || ''] || '#64748B'
}

function getInitials(name: string) {
  return name.split(' ').filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
}

function getMappingCounterpart(mapping: OrgChartMapping, userId: string) {
  return mapping.evaluatorId === userId ? mapping.evaluatee : mapping.evaluator
}

function RelationshipBadge({ type }: { type: RelationshipType }) {
  return (
    <Badge
      variant="outline"
      className="border-white/10 bg-white/5 text-[11px]"
      style={{ borderColor: `${ORG_CHART_EDGE_COLORS[type]}66`, color: ORG_CHART_EDGE_COLORS[type] }}
    >
      {ORG_CHART_EDGE_LABELS[type]}
    </Badge>
  )
}

function EmployeeNode({ data, selected }: NodeProps<OrgChartNodeData>) {
  return (
    <div
      className={`min-w-[188px] rounded-2xl border bg-[#111318]/95 px-4 py-3 text-left shadow-xl ${selected ? 'ring-2 ring-sky-400/80' : ''}`}
      style={{ borderColor: `${data.color}88` }}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-slate-400" />
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-0 !bg-slate-400" />
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-slate-400" />
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-0 !bg-slate-400" />
      <div className="flex gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold text-white" style={{ background: data.color }}>
          {getInitials(data.label)}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">{data.label}</div>
          <div className="mt-1 line-clamp-2 text-xs text-slate-300">{data.subtitle}</div>
          {data.department && <div className="mt-2 truncate text-[11px] uppercase tracking-[0.18em] text-slate-400">{data.department}</div>}
        </div>
      </div>
    </div>
  )
}

function CompanyNode({ data, selected }: NodeProps<OrgChartNodeData>) {
  return (
    <div className={`min-w-[220px] rounded-[24px] border border-slate-700 bg-slate-900/95 px-5 py-4 text-white shadow-xl ${selected ? 'ring-2 ring-sky-400/80' : ''}`}>
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-0 !bg-slate-400" />
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-700"><Building2 className="h-5 w-5 text-white" /></div>
        <div>
          <div className="text-sm font-semibold">{data.label}</div>
          <div className="mt-1 text-xs text-slate-300">{data.subtitle}</div>
        </div>
      </div>
    </div>
  )
}

function GroupNode({ data, selected }: NodeProps<OrgChartNodeData>) {
  return (
    <div
      className={`min-w-[220px] rounded-[24px] border bg-[#131724]/95 px-5 py-4 text-white shadow-xl ${selected ? 'ring-2 ring-sky-400/80' : ''}`}
      style={{ borderColor: `${data.color}88` }}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-slate-400" />
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-slate-400" />
      <div className="flex items-start gap-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white"
          style={{ background: data.color }}
        >
          <Users className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold">{data.label}</div>
          <div className="mt-1 line-clamp-3 text-xs text-slate-300">{data.subtitle}</div>
          {data.department && (
            <div className="mt-2 truncate text-[11px] uppercase tracking-[0.18em] text-slate-400">
              {data.department}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const nodeTypes = { employee: EmployeeNode, company: CompanyNode, group: GroupNode }

export default function OrgChartPage() {
  const [users, setUsers] = useState<OrgChartUser[]>([])
  const [mappings, setMappings] = useState<OrgChartMapping[]>([])
  const [meta, setMeta] = useState<OrgChartMeta>(EMPTY_META)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('focused')
  const [relationshipFilter, setRelationshipFilter] = useState<RelationshipType | 'all'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedMappingId, setSelectedMappingId] = useState<string | null>(null)
  const [isolateSelected, setIsolateSelected] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingMapping, setEditingMapping] = useState<OrgChartMapping | null>(null)
  const [formData, setFormData] = useState<MappingFormState>(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const [nodes, setNodes, onNodesChange] = useNodesState<OrgChartNodeData>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const flowRef = useRef<ReactFlowInstance | null>(null)
  const pendingPositions = useRef<Map<string, { x: number; y: number }>>(new Map())
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadData = useCallback(async (showRefreshing = false) => {
    try {
      showRefreshing ? setRefreshing(true) : setLoading(true)
      const response = await fetch('/api/admin/org-chart', { cache: 'no-store' })
      if (!response.ok) throw new Error('Failed to fetch org chart data')
      const data = (await response.json()) as OrgChartApiResponse
      setUsers(data.users || [])
      setMappings(data.mappings || [])
      setMeta(data.meta || EMPTY_META)
    } catch (error) {
      console.error(error)
      toast.error('Failed to load mapping graph')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { void loadData() }, [loadData])
  useEffect(() => () => { if (saveTimeout.current) clearTimeout(saveTimeout.current) }, [])

  const sortedUsers = useMemo(() => sortUsersByName(users), [users])
  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users])
  const selectedUser = selectedUserId ? usersById.get(selectedUserId) ?? null : null
  const selectedMapping = selectedMappingId ? mappings.find((mapping) => mapping.id === selectedMappingId) ?? null : null

  useEffect(() => {
    if (users.length === 0) return setSelectedUserId('')
    if (!selectedUserId || !usersById.has(selectedUserId)) setSelectedUserId(sortedUsers[0]?.id || '')
  }, [selectedUserId, sortedUsers, users.length, usersById])

  const scene = useMemo(() => {
    if (users.length === 0) return { nodes: [], edges: [], visibleUserIds: [] as string[] }
    if (viewMode === 'focused') return buildFocusedOrgChartScene(users, mappings, { selectedUserId: selectedUserId || sortedUsers[0]?.id || '', relationshipFilter })
    if (viewMode === 'overview') return buildOverviewOrgChartScene(users, mappings, { relationshipFilter, searchTerm, isolateUserId: isolateSelected ? selectedUserId || null : null })
    return buildHierarchyOrgChartScene(users, mappings)
  }, [users, mappings, viewMode, selectedUserId, sortedUsers, relationshipFilter, searchTerm, isolateSelected])

  useEffect(() => {
    if (selectedMappingId && !scene.edges.some((edge) => edge.id === selectedMappingId)) setSelectedMappingId(null)
  }, [scene.edges, selectedMappingId])

  const flowNodes = useMemo<FlowNode<OrgChartNodeData>[]>(() => scene.nodes.map((sceneNode) => {
    if (sceneNode.kind === 'company') {
      return {
        id: sceneNode.id,
        type: 'company',
        position: sceneNode.position,
        draggable: false,
        data: {
          label: sceneNode.label || COMPANY_NAME,
          subtitle: sceneNode.subtitle || 'Company anchor for the hierarchy lens',
          color: sceneNode.color || '#64748B',
          department: sceneNode.department || null,
        },
      }
    }

    if (sceneNode.kind === 'group') {
      return {
        id: sceneNode.id,
        type: 'group',
        position: sceneNode.position,
        draggable: false,
        selectable: false,
        data: {
          label: sceneNode.label || 'Group',
          subtitle: sceneNode.subtitle || '',
          color: sceneNode.color || '#64748B',
          department: sceneNode.department || null,
        },
      }
    }

    const user = sceneNode.userId ? usersById.get(sceneNode.userId) : null
    return {
      id: sceneNode.id,
      type: 'employee',
      position: sceneNode.position,
      draggable: viewMode !== 'focused',
      data: {
        label: user?.name || 'Unknown user',
        subtitle: user?.position || user?.department || 'No role information',
        color: user ? getUserColor(user) : '#64748B',
        department: user?.department || null,
        userId: user?.id,
      },
    }
  }), [scene.nodes, usersById, viewMode])

  const flowEdges = useMemo<FlowEdge[]>(() => scene.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: 'smoothstep',
    animated: viewMode === 'focused' && !edge.synthetic,
    markerEnd: { type: MarkerType.ArrowClosed, color: edge.color },
    data: { mappingId: edge.synthetic ? null : edge.id },
    label: edge.label,
    style: { stroke: edge.color, strokeWidth: selectedMappingId === edge.id ? 3.5 : 2.2, strokeDasharray: edge.synthetic ? '7 5' : undefined },
    labelBgStyle: { fill: '#0F172A', fillOpacity: 0.92 },
    labelBgPadding: [8, 4],
    labelBgBorderRadius: 999,
    labelStyle: { fill: edge.color, fontSize: 11, fontWeight: 700 },
  })), [scene.edges, selectedMappingId, viewMode])

  useEffect(() => { setNodes(flowNodes) }, [flowNodes, setNodes])
  useEffect(() => { setEdges(flowEdges) }, [flowEdges, setEdges])

  useEffect(() => {
    if (!flowRef.current || flowNodes.length === 0) return
    const frame = window.requestAnimationFrame(() => flowRef.current?.fitView({ padding: viewMode === 'focused' ? 0.3 : 0.18, duration: 350 }))
    return () => window.cancelAnimationFrame(frame)
  }, [flowEdges, flowNodes, viewMode])

  const savePendingPositions = useCallback(async () => {
    if (pendingPositions.current.size === 0) return
    const positions = [...pendingPositions.current.entries()].map(([id, position]) => ({ id, x: Math.round(position.x), y: Math.round(position.y) }))
    pendingPositions.current.clear()
    try {
      await fetch('/api/admin/chart-positions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ positions }) })
    } catch (error) {
      console.error(error)
      toast.error('Failed to save chart positions')
    }
  }, [])

  const queuePositionSave = useCallback((userId: string, x: number, y: number) => {
    pendingPositions.current.set(userId, { x, y })
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
    saveTimeout.current = setTimeout(() => { void savePendingPositions() }, 500)
  }, [savePendingPositions])

  const handleNodeDragStop = useCallback((_event: React.MouseEvent, node: FlowNode<OrgChartNodeData>) => {
    if (viewMode === 'focused' || node.id === 'company' || !node.data.userId) return
    setUsers((currentUsers) => currentUsers.map((user) => user.id === node.data.userId ? { ...user, chartX: Math.round(node.position.x), chartY: Math.round(node.position.y) } : user))
    queuePositionSave(node.data.userId, node.position.x, node.position.y)
  }, [queuePositionSave, viewMode])

  const handleNodeClick = useCallback((_event: React.MouseEvent, node: FlowNode<OrgChartNodeData>) => {
    if (!node.data.userId) return
    setSelectedMappingId(null)
    setSelectedUserId(node.data.userId)
  }, [])

  const handleEdgeClick = useCallback((_event: React.MouseEvent, edge: FlowEdge) => {
    if (typeof edge.data?.mappingId !== 'string') return
    setSelectedMappingId(edge.data.mappingId)
  }, [])

  const openAddMapping = useCallback((nextState?: Partial<MappingFormState>) => {
    setEditingMapping(null)
    setFormData({
      evaluatorId: nextState?.evaluatorId ?? '',
      evaluateeId: nextState?.evaluateeId ?? '',
      relationshipType: nextState?.relationshipType ?? 'TEAM_LEAD',
    })
    setIsModalOpen(true)
  }, [])

  const openEditMapping = useCallback((mapping: OrgChartMapping) => {
    setEditingMapping(mapping)
    setFormData({
      evaluatorId: mapping.evaluatorId,
      evaluateeId: mapping.evaluateeId,
      relationshipType: mapping.relationshipType,
    })
    setIsModalOpen(true)
  }, [])

  const handleSubmit = useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!formData.evaluatorId || !formData.evaluateeId || !formData.relationshipType) {
      toast.error('Please complete all mapping fields')
      return
    }

    setSaving(true)
    try {
      if (editingMapping) {
        const didChange =
          editingMapping.evaluatorId !== formData.evaluatorId ||
          editingMapping.evaluateeId !== formData.evaluateeId ||
          editingMapping.relationshipType !== formData.relationshipType

        if (!didChange) {
          setIsModalOpen(false)
          setEditingMapping(null)
          setSaving(false)
          return
        }

        const deleteResponse = await fetch(`/api/admin/mappings?id=${editingMapping.id}`, { method: 'DELETE' })
        if (!deleteResponse.ok) {
          const error = await deleteResponse.json().catch(() => ({ error: 'Failed to update mapping' }))
          throw new Error(error.error || 'Failed to update mapping')
        }
      }

      const createResponse = await fetch('/api/admin/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      if (!createResponse.ok) {
        const error = await createResponse.json().catch(() => ({ error: 'Failed to save mapping' }))
        throw new Error(error.error || 'Failed to save mapping')
      }

      toast.success(editingMapping ? 'Mapping updated' : 'Mapping created')
      setIsModalOpen(false)
      setEditingMapping(null)
      setSelectedMappingId(null)
      setSelectedUserId(formData.evaluateeId)
      await loadData(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save mapping')
    } finally {
      setSaving(false)
    }
  }, [editingMapping, formData, loadData])

  const handleDeleteMapping = useCallback(async (mapping: OrgChartMapping) => {
    const confirmed = window.confirm(
      `Delete ${RELATIONSHIP_TYPE_LABELS[mapping.relationshipType]} between ${mapping.evaluator.name} and ${mapping.evaluatee.name}?`
    )
    if (!confirmed) return

    try {
      const response = await fetch(`/api/admin/mappings?id=${mapping.id}`, { method: 'DELETE' })
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to delete mapping' }))
        throw new Error(error.error || 'Failed to delete mapping')
      }

      toast.success('Mapping deleted')
      setSelectedMappingId((current) => (current === mapping.id ? null : current))
      await loadData(true)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete mapping')
    }
  }, [loadData])

  const handleResetPositions = useCallback(async () => {
    const confirmed = window.confirm('Reset all saved graph positions for this workspace?')
    if (!confirmed) return

    try {
      const response = await fetch('/api/admin/chart-positions', { method: 'DELETE' })
      if (!response.ok) throw new Error('Failed to reset chart positions')
      toast.success('Chart positions reset')
      await loadData(true)
    } catch (error) {
      console.error(error)
      toast.error('Failed to reset chart positions')
    }
  }, [loadData])

  const userMappings = useMemo(() => {
    if (!selectedUserId) return { incoming: [] as OrgChartMapping[], outgoing: [] as OrgChartMapping[], peers: [] as OrgChartMapping[] }

    const incoming = mappings
      .filter((mapping) => mapping.evaluateeId === selectedUserId && mapping.relationshipType !== 'PEER')
      .sort((left, right) =>
        left.relationshipType.localeCompare(right.relationshipType) ||
        left.evaluator.name.localeCompare(right.evaluator.name, undefined, { sensitivity: 'base' })
      )

    const outgoing = mappings
      .filter((mapping) => mapping.evaluatorId === selectedUserId && mapping.relationshipType !== 'PEER')
      .sort((left, right) =>
        left.relationshipType.localeCompare(right.relationshipType) ||
        left.evaluatee.name.localeCompare(right.evaluatee.name, undefined, { sensitivity: 'base' })
      )

    const peers = mappings
      .filter((mapping) => mapping.relationshipType === 'PEER' && (mapping.evaluatorId === selectedUserId || mapping.evaluateeId === selectedUserId))
      .sort((left, right) =>
        getMappingCounterpart(left, selectedUserId).name.localeCompare(
          getMappingCounterpart(right, selectedUserId).name,
          undefined,
          { sensitivity: 'base' }
        )
      )

    return { incoming, outgoing, peers }
  }, [mappings, selectedUserId])

  const relationshipSummary = useMemo(
    () => GRAPH_TYPES.filter((type) => meta.relationshipCounts[type] > 0).map((type) => ({ type, count: meta.relationshipCounts[type] })),
    [meta.relationshipCounts]
  )

  const renderMappingList = (items: OrgChartMapping[], section: 'incoming' | 'outgoing' | 'peers') => {
    if (items.length === 0) {
      return <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-muted-foreground">No {section} mappings for this person.</div>
    }

    return items.map((mapping) => {
      const counterpart =
        section === 'incoming' ? mapping.evaluator : section === 'outgoing' ? mapping.evaluatee : getMappingCounterpart(mapping, selectedUserId)

      return (
        <div key={mapping.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">{counterpart.name}</div>
              <div className="mt-1 text-xs text-muted-foreground">{counterpart.department || counterpart.position || 'No department'}</div>
            </div>
            <RelationshipBadge type={mapping.relationshipType} />
          </div>
          <div className="mt-3 flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => openEditMapping(mapping)}><Pencil className="h-4 w-4" />Edit</Button>
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => void handleDeleteMapping(mapping)}><Trash2 className="h-4 w-4" />Delete</Button>
          </div>
        </div>
      )
    })
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <Network className="mx-auto h-10 w-10 animate-pulse text-muted-foreground" />
          <p className="mt-4 text-sm text-muted-foreground">Building mapping workspace...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.26em] text-muted-foreground">Admin Workspace</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Org Mapping Graph</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            This view shows evaluator mappings as they actually exist. Focus on one person, inspect the full company graph, or switch to the Team Lead hierarchy lens for reporting-only structure.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void loadData(true)} disabled={refreshing}><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />Refresh</Button>
          <Button variant="outline" onClick={handleResetPositions} disabled={viewMode === 'focused'}><GitBranch className="h-4 w-4" />Reset Layout</Button>
          <Button onClick={() => openAddMapping(selectedUser ? { evaluateeId: selectedUser.id } : undefined)}><Plus className="h-4 w-4" />Add Mapping</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          { icon: Users, label: 'Visible employees', value: users.length, color: 'text-sky-400 bg-sky-500/10' },
          { icon: Link2, label: 'Evaluator mappings', value: mappings.length, color: 'text-violet-400 bg-violet-500/10' },
          { icon: GitBranch, label: 'Top-level leaders', value: meta.topLevelLeaderIds.length, color: 'text-emerald-400 bg-emerald-500/10' },
          { icon: Network, label: 'Isolated nodes', value: meta.isolatedUserIds.length, color: 'text-amber-400 bg-amber-500/10' },
        ].map((stat) => (
          <Card key={stat.label} className="border-white/10 bg-[#111318]">
            <CardContent className="flex items-center gap-4 p-5">
              <div className={`rounded-2xl p-3 ${stat.color}`}><stat.icon className="h-5 w-5" /></div>
              <div><div className="text-2xl font-semibold">{stat.value}</div><div className="text-sm text-muted-foreground">{stat.label}</div></div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-white/10 bg-[#111318]">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle>Workspace Controls</CardTitle>
              <CardDescription className="mt-1">Focused centers one person, overview shows the network, and hierarchy uses only Team Lead edges.</CardDescription>
            </div>
            <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)}>
              <TabsList className="grid w-full grid-cols-3 lg:w-[360px]">
                <TabsTrigger value="focused">Focused</TabsTrigger>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="hierarchy">Hierarchy</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 xl:flex-row">
            <div className="xl:w-[320px]">
              <Label>Selected Person</Label>
              <Select value={selectedUserId || '__empty__'} onValueChange={(value) => setSelectedUserId(value === '__empty__' ? '' : value)}>
                <SelectTrigger className="mt-2"><SelectValue placeholder="Select a person" /></SelectTrigger>
                <SelectContent>
                  {sortedUsers.map((user) => <SelectItem key={user.id} value={user.id}>{user.name}{user.department ? ` (${user.department})` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="xl:w-[260px]">
              <Label>Relationship Filter</Label>
              <Select value={viewMode === 'hierarchy' ? 'TEAM_LEAD' : relationshipFilter} onValueChange={(value) => setRelationshipFilter(value as RelationshipType | 'all')} disabled={viewMode === 'hierarchy'}>
                <SelectTrigger className="mt-2"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All relationships</SelectItem>
                  {GRAPH_TYPES.map((type) => <SelectItem key={type} value={type}>{RELATIONSHIP_TYPE_LABELS[type]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1">
              <Label>Search the Company Graph</Label>
              <div className="relative mt-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Find a person and show their nearby graph" className="pl-9" disabled={viewMode !== 'overview'} />
              </div>
            </div>

            <div className="flex items-end">
              <Button variant={isolateSelected ? 'default' : 'outline'} onClick={() => setIsolateSelected((current) => !current)} disabled={viewMode !== 'overview' || !selectedUser}>
                <Users className="h-4 w-4" />{isolateSelected ? 'Show Full Graph' : 'Isolate Selected'}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {relationshipSummary.map(({ type, count }) => (
              <div key={type} className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs" style={{ borderColor: `${ORG_CHART_EDGE_COLORS[type]}55`, color: ORG_CHART_EDGE_COLORS[type], backgroundColor: `${ORG_CHART_EDGE_COLORS[type]}10` }}>
                <span className="font-semibold">{ORG_CHART_EDGE_LABELS[type]}</span><span>{count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="overflow-hidden border-white/10 bg-[#0B1020]">
          <CardHeader className="border-b border-white/10 pb-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>{viewMode === 'focused' ? 'Focused Mapping View' : viewMode === 'overview' ? 'Company Mapping Overview' : 'Team Lead Hierarchy Lens'}</CardTitle>
                <CardDescription className="mt-1">
                  {viewMode === 'focused' ? 'Incoming and outgoing evaluator links around the selected person.' : viewMode === 'overview' ? 'The full evaluator network with optional filtering and neighborhood isolation.' : 'Only TEAM_LEAD mappings are shown here, rooted from the company node.'}
                </CardDescription>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted-foreground">{scene.visibleUserIds.length} visible nodes</div>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="h-[72vh] min-h-[720px]">
              {nodes.length === 0 ? (
                <div className="flex h-full items-center justify-center text-center">
                  <div><Network className="mx-auto h-10 w-10 text-muted-foreground" /><p className="mt-4 text-sm font-medium">No graph to show for this filter</p><p className="mt-2 text-sm text-muted-foreground">Try another relationship filter, clear the search, or select a different person.</p></div>
                </div>
              ) : (
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onNodeClick={handleNodeClick}
                  onEdgeClick={handleEdgeClick}
                  onNodeDragStop={handleNodeDragStop}
                  onPaneClick={() => setSelectedMappingId(null)}
                  onInit={(instance) => { flowRef.current = instance }}
                  proOptions={{ hideAttribution: true }}
                  fitView
                  nodesConnectable={false}
                  selectionOnDrag={false}
                  minZoom={0.25}
                >
                  <Background color="#223047" gap={20} />
                  <MiniMap pannable zoomable className="!bg-[#0F172A]" nodeColor={(node) => node.type === 'company' ? '#64748B' : ((node.data as OrgChartNodeData | undefined)?.color || '#64748B')} />
                  <Controls className="!bg-slate-950/80 !text-white" />
                </ReactFlow>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {selectedMapping && (
            <Card className="border-white/10 bg-[#111318]">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>Selected Mapping</CardTitle>
                    <CardDescription className="mt-1">Edit or remove this evaluator relationship directly from the graph workspace.</CardDescription>
                  </div>
                  <RelationshipBadge type={selectedMapping.relationshipType} />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Evaluator</div>
                  <div className="mt-1 text-sm font-semibold">{selectedMapping.evaluator.name}</div>
                  <div className="mt-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">Evaluatee</div>
                  <div className="mt-1 text-sm font-semibold">{selectedMapping.evaluatee.name}</div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => openEditMapping(selectedMapping)}><Pencil className="h-4 w-4" />Edit</Button>
                  <Button variant="destructive" className="flex-1" onClick={() => void handleDeleteMapping(selectedMapping)}><Trash2 className="h-4 w-4" />Delete</Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-white/10 bg-[#111318]">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>{selectedUser ? selectedUser.name : 'Select a person'}</CardTitle>
                  <CardDescription className="mt-1">
                    {selectedUser ? `${selectedUser.position || 'Employee'}${selectedUser.department ? ` | ${selectedUser.department}` : ''}` : 'Click a node or choose someone above to inspect their mapping neighborhood.'}
                  </CardDescription>
                </div>
                {selectedUser && <div className="h-11 w-11 rounded-2xl" style={{ background: getUserColor(selectedUser) }} />}
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              {selectedUser ? (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Incoming', value: userMappings.incoming.length },
                      { label: 'Outgoing', value: userMappings.outgoing.length },
                      { label: 'Peers', value: userMappings.peers.length },
                    ].map((item) => (
                      <div key={item.label} className="rounded-2xl border border-white/10 bg-white/5 p-3 text-center">
                        <div className="text-xl font-semibold">{item.value}</div>
                        <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{item.label}</div>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => openAddMapping({ evaluateeId: selectedUser.id, relationshipType: 'TEAM_LEAD' })}><Plus className="h-4 w-4" />Add Incoming</Button>
                    <Button size="sm" variant="outline" onClick={() => openAddMapping({ evaluatorId: selectedUser.id, relationshipType: 'TEAM_LEAD' })}><Plus className="h-4 w-4" />Add Outgoing</Button>
                    <Button size="sm" variant="outline" onClick={() => openAddMapping({ evaluatorId: selectedUser.id, relationshipType: 'PEER' })}><Plus className="h-4 w-4" />Add Peer</Button>
                  </div>

                  <div className="space-y-4">
                    <div><div className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">Incoming Relationships</div><div className="space-y-2">{renderMappingList(userMappings.incoming, 'incoming')}</div></div>
                    <div><div className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">Outgoing Relationships</div><div className="space-y-2">{renderMappingList(userMappings.outgoing, 'outgoing')}</div></div>
                    <div><div className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">Peer Relationships</div><div className="space-y-2">{renderMappingList(userMappings.peers, 'peers')}</div></div>
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-muted-foreground">Select a node to inspect incoming, outgoing, and peer mappings.</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingMapping(null) }} title={editingMapping ? 'Edit Mapping' : 'Add Mapping'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Evaluator</Label>
            <Select value={formData.evaluatorId || '__empty__'} onValueChange={(value) => setFormData((current) => ({ ...current, evaluatorId: value === '__empty__' ? '' : value }))}>
              <SelectTrigger><SelectValue placeholder="Select evaluator..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__empty__">Select evaluator...</SelectItem>
                {sortedUsers.map((user) => <SelectItem key={user.id} value={user.id}>{user.name}{user.department ? ` (${user.department})` : ''}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Relationship Type</Label>
            <Select value={formData.relationshipType} onValueChange={(value) => setFormData((current) => ({ ...current, relationshipType: value as RelationshipType }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{GRAPH_TYPES.map((type) => <SelectItem key={type} value={type}>{RELATIONSHIP_TYPE_LABELS[type]}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Evaluatee</Label>
            <Select value={formData.evaluateeId || '__empty__'} onValueChange={(value) => setFormData((current) => ({ ...current, evaluateeId: value === '__empty__' ? '' : value }))}>
              <SelectTrigger><SelectValue placeholder="Select evaluatee..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__empty__">Select evaluatee...</SelectItem>
                {sortedUsers.map((user) => <SelectItem key={user.id} value={user.id}>{user.name}{user.department ? ` (${user.department})` : ''}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => { setIsModalOpen(false); setEditingMapping(null) }}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : editingMapping ? 'Update Mapping' : 'Create Mapping'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
