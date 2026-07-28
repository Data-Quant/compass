'use client'

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { useReducedMotion } from 'framer-motion'
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
} from 'reactflow'
import 'reactflow/dist/style.css'
import {
  Building2,
  GitFork,
  ListTree,
  Network,
  UserRoundSearch,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import styles from './EmployeeRelationshipMap.module.css'

export type EmployeeRelationshipLayer =
  | 'clients'
  | 'leads'
  | 'reports'
  | 'evaluators'
  | 'colleagues'

export type EmployeeRelationshipMapTone = 'primary' | 'comparison'

export interface RelationshipMapPerson {
  id?: string | null
  name?: string | null
  position?: string | null
  department?: string | null
}

export interface RelationshipMapClient {
  id?: string | null
  name?: string | null
  role?: 'MANAGER' | 'MEMBER' | string | null
  assignedAt?: string | null
  startDate?: string | null
  client?: {
    id?: string | null
    name?: string | null
  } | null
}

export interface RelationshipMapEvaluator extends RelationshipMapPerson {
  relationshipType?: string | null
  meanGiven?: number | null
  raterDeviation?: number | null
  raterIsProvisional?: boolean | null
  evaluator?: RelationshipMapPerson | null
}

export interface SharedClientColleague extends RelationshipMapPerson {
  clients?: Array<string | { id?: string | null; name?: string | null }> | null
  sharedClients?: Array<string | { id?: string | null; name?: string | null }> | null
}

export interface EmployeeRelationshipNetwork {
  leads?: RelationshipMapPerson[] | null
  reports?: RelationshipMapPerson[] | null
  colleagues?: SharedClientColleague[] | null
  sharedClientColleagues?: SharedClientColleague[] | null
}

export interface EmployeeRelationshipMapProps {
  employee: RelationshipMapPerson
  clients?: RelationshipMapClient[] | null
  evaluators?: RelationshipMapEvaluator[] | null
  network?: EmployeeRelationshipNetwork | null
  /** Called only for person nodes with a usable employee id. */
  onPivotEmployee?: (employeeId: string) => void
  /** Amber identifies a primary dossier; cyan identifies a comparison dossier. */
  tone?: EmployeeRelationshipMapTone
  /** Initial visibility only; layer controls remain local to this component. */
  initialLayers?: Partial<Record<EmployeeRelationshipLayer, boolean>>
  /**
   * Dense graphs are capped deterministically. The structured view always
   * includes every item, including graph-overflow items.
   */
  maxGraphNodes?: number
  height?: number | string
  className?: string
  ariaLabel?: string
}

type EntityKind = 'subject' | 'person' | 'client'
type ViewMode = 'map' | 'list'

interface RelationshipNodeData {
  kind: EntityKind
  title: string
  eyebrow: string
  detail: string | null
  accent: string
  attention: boolean
  pivotId: string | null
  onPivotEmployee?: (employeeId: string) => void
}

interface NormalizedEntity {
  key: string
  kind: Exclude<EntityKind, 'subject'>
  id: string | null
  name: string
  detail: string | null
  attention: boolean
}

interface RelationshipRecord {
  layer: EmployeeRelationshipLayer
  entity: NormalizedEntity
  edgeLabel: string
  listDetail: string | null
}

interface GraphEntity {
  entity: NormalizedEntity
  records: RelationshipRecord[]
  primaryLayer: EmployeeRelationshipLayer
}

const GRAPHITE = '#080D16'
const BONE = '#EEE8D8'
const MUTED = '#98A3B3'
const AMBER = '#E7B75A'
const CYAN = '#68C7D4'
const CORAL = '#EF7C68'

const LAYERS: EmployeeRelationshipLayer[] = [
  'leads',
  'evaluators',
  'clients',
  'reports',
  'colleagues',
]

const LAYER_META: Record<
  EmployeeRelationshipLayer,
  { label: string; singular: string; color: string; centreAngle: number }
> = {
  leads: { label: 'Leads', singular: 'Team lead', color: AMBER, centreAngle: -126 },
  evaluators: { label: 'Evaluators', singular: 'Evaluator', color: CORAL, centreAngle: -54 },
  clients: { label: 'Clients', singular: 'Client', color: CYAN, centreAngle: 18 },
  reports: { label: 'Reports', singular: 'Direct report', color: BONE, centreAngle: 90 },
  colleagues: {
    label: 'Shared-client colleagues',
    singular: 'Shared-client colleague',
    color: '#A7B4C5',
    centreAngle: 162,
  },
}

const MAX_SAFE_GRAPH_NODES = 72
const DEFAULT_GRAPH_NODES = 36
const MAX_PER_RING = 6

const nodeTypes = { employee360Relationship: RelationshipEntityNode }

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value.trim()
  return cleaned.length > 0 ? cleaned : null
}

function stableText(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, ' ')
}

function compareText(
  left: { name: string; key: string },
  right: { name: string; key: string }
): number {
  return (
    left.name.localeCompare(right.name, 'en', { sensitivity: 'base' }) ||
    left.key.localeCompare(right.key)
  )
}

function initials(name: string): string {
  const result = name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return result || '—'
}

function humanizeToken(value: string | null | undefined): string {
  const cleaned = cleanText(value)
  if (!cleaned) return 'Unspecified lens'
  return cleaned
    .toLocaleLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toLocaleUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ')
}

function compactLabel(parts: string[], maxLength = 54): string {
  const joined = [...new Set(parts)].join(' · ')
  if (joined.length <= maxLength) return joined
  return `${joined.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`
}

function personDetail(person: RelationshipMapPerson): string | null {
  const position = cleanText(person.position)
  const department = cleanText(person.department)
  if (position && department) return `${position} · ${department}`
  return position ?? department
}

function clientNames(
  values: SharedClientColleague['clients'] | SharedClientColleague['sharedClients']
): string[] {
  if (!Array.isArray(values)) return []
  return values
    .map((client) => (typeof client === 'string' ? cleanText(client) : cleanText(client?.name)))
    .filter((name): name is string => name !== null)
    .sort((left, right) => left.localeCompare(right, 'en', { sensitivity: 'base' }))
}

function normalizePerson(
  person: RelationshipMapPerson,
  layer: EmployeeRelationshipLayer,
  index: number,
  fallbackName: string,
  attention = false
): NormalizedEntity {
  const id = cleanText(person.id)
  const name = cleanText(person.name) ?? fallbackName
  return {
    key: id ? `person:${id}` : `person:${layer}:${stableText(name)}:${index}`,
    kind: 'person',
    id,
    name,
    detail: personDetail(person),
    attention,
  }
}

function normalizeRelations({
  employeeId,
  clients,
  evaluators,
  network,
}: Pick<EmployeeRelationshipMapProps, 'clients' | 'evaluators' | 'network'> & {
  employeeId: string | null
}): RelationshipRecord[] {
  const records: RelationshipRecord[] = []

  const leads = Array.isArray(network?.leads) ? network.leads : []
  leads.forEach((lead, index) => {
    const entity = normalizePerson(lead, 'leads', index, `Lead ${index + 1}`)
    if (entity.id && entity.id === employeeId) return
    records.push({
      layer: 'leads',
      entity,
      edgeLabel: 'Team lead',
      listDetail: entity.detail,
    })
  })

  const evaluatorRows = Array.isArray(evaluators) ? evaluators : []
  evaluatorRows.forEach((row, index) => {
    const nestedIdentity = row.evaluator
    const identity =
      nestedIdentity && (cleanText(nestedIdentity.id) || cleanText(nestedIdentity.name))
        ? nestedIdentity
        : row
    const lens = humanizeToken(row.relationshipType)
    const entity = normalizePerson(
      identity,
      'evaluators',
      index,
      `Evaluator ${index + 1}`,
      row.raterIsProvisional === true
    )
    if (entity.id && entity.id === employeeId) return
    const mean =
      typeof row.meanGiven === 'number' && Number.isFinite(row.meanGiven)
        ? `Mean given ${row.meanGiven.toFixed(2)}`
        : null
    records.push({
      layer: 'evaluators',
      entity: { ...entity, detail: entity.detail ?? mean },
      edgeLabel: `Evaluator · ${lens}`,
      listDetail: [lens, mean, row.raterIsProvisional ? 'Calibration provisional' : null]
        .filter(Boolean)
        .join(' · '),
    })
  })

  const clientRows = Array.isArray(clients) ? clients : []
  clientRows.forEach((row, index) => {
    const id = cleanText(row.client?.id) ?? cleanText(row.id)
    const name = cleanText(row.client?.name) ?? cleanText(row.name) ?? `Client ${index + 1}`
    const role = humanizeToken(row.role)
    const entity: NormalizedEntity = {
      key: id ? `client:${id}` : `client:${stableText(name)}:${index}`,
      kind: 'client',
      id,
      name,
      detail: role === 'Unspecified lens' ? null : role,
      attention: false,
    }
    records.push({
      layer: 'clients',
      entity,
      edgeLabel: role === 'Unspecified lens' ? 'Client assignment' : `Client · ${role}`,
      listDetail: entity.detail,
    })
  })

  const reports = Array.isArray(network?.reports) ? network.reports : []
  reports.forEach((report, index) => {
    const entity = normalizePerson(report, 'reports', index, `Report ${index + 1}`)
    if (entity.id && entity.id === employeeId) return
    records.push({
      layer: 'reports',
      entity,
      edgeLabel: 'Direct report',
      listDetail: entity.detail,
    })
  })

  const colleagues = Array.isArray(network?.colleagues)
    ? network.colleagues
    : Array.isArray(network?.sharedClientColleagues)
      ? network.sharedClientColleagues
      : []
  colleagues.forEach((colleague, index) => {
    const entity = normalizePerson(
      colleague,
      'colleagues',
      index,
      `Colleague ${index + 1}`
    )
    if (entity.id && entity.id === employeeId) return
    const shared = clientNames(colleague.clients ?? colleague.sharedClients)
    const relationship =
      shared.length === 0
        ? 'Shared client'
        : shared.length <= 2
          ? `Shared · ${shared.join(', ')}`
          : `Shared clients · ${shared.length}`
    records.push({
      layer: 'colleagues',
      entity: {
        ...entity,
        detail:
          shared.length === 0
            ? entity.detail
            : `${shared.length} shared client${shared.length === 1 ? '' : 's'}`,
      },
      edgeLabel: relationship,
      listDetail: shared.length > 0 ? shared.join(', ') : entity.detail,
    })
  })

  return records
}

function coalesceRecords(records: RelationshipRecord[]): GraphEntity[] {
  const byEntity = new Map<string, RelationshipRecord[]>()
  for (const record of records) {
    const current = byEntity.get(record.entity.key)
    if (current) current.push(record)
    else byEntity.set(record.entity.key, [record])
  }

  return [...byEntity.values()]
    .map((entityRecords) => {
      const ordered = [...entityRecords].sort(
        (left, right) => LAYERS.indexOf(left.layer) - LAYERS.indexOf(right.layer)
      )
      const base = ordered[0].entity
      return {
        entity: {
          ...base,
          attention: ordered.some((record) => record.entity.attention),
          detail: base.detail ?? ordered.find((record) => record.entity.detail)?.entity.detail ?? null,
        },
        records: ordered,
        primaryLayer: ordered[0].layer,
      }
    })
    .sort((left, right) => compareText(left.entity, right.entity))
}

function capGraphEntities(entities: GraphEntity[], limit: number): GraphEntity[] {
  if (entities.length <= limit) return entities

  const queues = new Map(
    LAYERS.map((layer) => [
      layer,
      entities
        .filter((entity) => entity.primaryLayer === layer)
        .sort((left, right) => compareText(left.entity, right.entity)),
    ])
  )
  const selected: GraphEntity[] = []
  let offset = 0

  while (selected.length < limit) {
    let found = false
    for (const layer of LAYERS) {
      const next = queues.get(layer)?.[offset]
      if (!next) continue
      selected.push(next)
      found = true
      if (selected.length === limit) break
    }
    if (!found) break
    offset += 1
  }

  return selected
}

function positionOnSector(
  layer: EmployeeRelationshipLayer,
  index: number,
  total: number
): { x: number; y: number } {
  const ring = Math.floor(index / MAX_PER_RING)
  const ringStart = ring * MAX_PER_RING
  const ringCount = Math.min(MAX_PER_RING, total - ringStart)
  const indexInRing = index - ringStart
  const spread = ringCount <= 1 ? 0 : Math.min(58, 15 + ringCount * 7)
  const angle =
    LAYER_META[layer].centreAngle +
    (ringCount <= 1 ? 0 : -spread / 2 + (indexInRing / (ringCount - 1)) * spread)
  const radians = (angle * Math.PI) / 180
  const radius = 340 + ring * 178

  return {
    x: Math.cos(radians) * radius - 100,
    y: Math.sin(radians) * radius - 37,
  }
}

function edgeHandles(position: { x: number; y: number }): {
  sourceHandle: string
  targetHandle: string
} {
  const centreX = position.x + 100
  const centreY = position.y + 37
  if (Math.abs(centreX) >= Math.abs(centreY)) {
    return centreX >= 0
      ? { sourceHandle: 'source-right', targetHandle: 'target-left' }
      : { sourceHandle: 'source-left', targetHandle: 'target-right' }
  }
  return centreY >= 0
    ? { sourceHandle: 'source-bottom', targetHandle: 'target-top' }
    : { sourceHandle: 'source-top', targetHandle: 'target-bottom' }
}

function RelationshipHandles() {
  return (
    <>
      <Handle
        id="target-left"
        type="target"
        position={Position.Left}
        isConnectable={false}
        className={styles.hiddenHandle}
      />
      <Handle
        id="target-right"
        type="target"
        position={Position.Right}
        isConnectable={false}
        className={styles.hiddenHandle}
      />
      <Handle
        id="target-top"
        type="target"
        position={Position.Top}
        isConnectable={false}
        className={styles.hiddenHandle}
      />
      <Handle
        id="target-bottom"
        type="target"
        position={Position.Bottom}
        isConnectable={false}
        className={styles.hiddenHandle}
      />
      <Handle
        id="source-left"
        type="source"
        position={Position.Left}
        isConnectable={false}
        className={styles.hiddenHandle}
      />
      <Handle
        id="source-right"
        type="source"
        position={Position.Right}
        isConnectable={false}
        className={styles.hiddenHandle}
      />
      <Handle
        id="source-top"
        type="source"
        position={Position.Top}
        isConnectable={false}
        className={styles.hiddenHandle}
      />
      <Handle
        id="source-bottom"
        type="source"
        position={Position.Bottom}
        isConnectable={false}
        className={styles.hiddenHandle}
      />
    </>
  )
}

function RelationshipNodeBody({ data }: { data: RelationshipNodeData }) {
  return (
    <div className={styles.nodeBody}>
      <div className={styles.avatar} aria-hidden>
        {data.kind === 'client' ? <Building2 className="h-4 w-4" /> : initials(data.title)}
      </div>
      <div className={styles.nodeCopy}>
        <div className={styles.nodeEyebrow}>{data.eyebrow}</div>
        <div className={styles.nodeTitle} title={data.title}>
          {data.title}
        </div>
        {data.detail && (
          <div className={styles.nodeDetail} title={data.detail}>
            {data.detail}
          </div>
        )}
      </div>
      {data.attention && (
        <span
          className={styles.attentionDot}
          title="Calibration context is provisional"
          aria-label="Calibration context is provisional"
        />
      )}
    </div>
  )
}

function RelationshipEntityNode({ data }: NodeProps<RelationshipNodeData>) {
  const nodeStyle = { '--node-accent': data.accent } as CSSProperties
  const className = cn(styles.node, data.kind === 'subject' && styles.subjectNode)

  return (
    <div className={className} style={nodeStyle}>
      <RelationshipHandles />
      {data.pivotId && data.onPivotEmployee ? (
        <button
          type="button"
          className={cn(styles.nodeButton, 'nodrag nopan')}
          onClick={(event) => {
            event.stopPropagation()
            data.onPivotEmployee?.(data.pivotId as string)
          }}
          aria-label={`Open Employee 360 dossier for ${data.title}`}
        >
          <RelationshipNodeBody data={data} />
        </button>
      ) : (
        <RelationshipNodeBody data={data} />
      )}
    </div>
  )
}

function layerIcon(layer: EmployeeRelationshipLayer) {
  if (layer === 'clients') return <Building2 className="h-3.5 w-3.5" aria-hidden />
  if (layer === 'evaluators') {
    return <UserRoundSearch className="h-3.5 w-3.5" aria-hidden />
  }
  if (layer === 'leads' || layer === 'reports') {
    return <GitFork className="h-3.5 w-3.5" aria-hidden />
  }
  return <Users className="h-3.5 w-3.5" aria-hidden />
}

function StructuredRelationshipList({
  records,
  activeLayers,
  onPivotEmployee,
  headingIdPrefix,
}: {
  records: RelationshipRecord[]
  activeLayers: Record<EmployeeRelationshipLayer, boolean>
  onPivotEmployee?: (employeeId: string) => void
  headingIdPrefix: string
}) {
  const visibleLayers = LAYERS.filter((layer) => activeLayers[layer])

  if (!records.some((record) => activeLayers[record.layer])) {
    return (
      <div className="flex min-h-[22rem] items-center justify-center p-8 text-center">
        <div>
          <Network className="mx-auto h-8 w-8 text-slate-500" aria-hidden />
          <p className="mt-3 text-sm font-medium text-[#EEE8D8]">No relationships in view</p>
          <p className="mt-1 text-xs text-[#98A3B3]">Turn on a populated layer above.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative z-[1] grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
      {visibleLayers.map((layer) => {
        const items = records
          .filter((record) => record.layer === layer)
          .sort((left, right) => compareText(left.entity, right.entity))
        if (items.length === 0) return null
        const meta = LAYER_META[layer]

        return (
          <section
            key={layer}
            className="rounded-xl border border-[#243246] bg-[#0A111C]/90 p-3"
            aria-labelledby={`${headingIdPrefix}-${layer}`}
          >
            <div className="mb-2 flex items-center justify-between gap-3">
              <h4
                id={`${headingIdPrefix}-${layer}`}
                className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em]"
                style={{ color: meta.color }}
              >
                {layerIcon(layer)}
                {meta.label}
              </h4>
              <span className="font-mono text-[10px] text-[#98A3B3]">{items.length}</span>
            </div>
            <ul className="space-y-1.5">
              {items.map((record, index) => {
                const content = (
                  <>
                    <span className="block truncate text-xs font-medium text-[#EEE8D8]">
                      {record.entity.name}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-[#98A3B3]">
                      {record.listDetail ?? record.edgeLabel}
                    </span>
                  </>
                )
                const key = `${record.entity.key}:${record.edgeLabel}:${index}`

                return (
                  <li key={key}>
                    {record.entity.kind === 'person' &&
                    record.entity.id &&
                    onPivotEmployee ? (
                      <button
                        type="button"
                        className={cn(
                          styles.listButton,
                          'block border border-transparent bg-white/[0.025] px-2.5 py-2 hover:border-[#68C7D4]/30 hover:bg-[#68C7D4]/[0.07]'
                        )}
                        onClick={() => onPivotEmployee(record.entity.id as string)}
                        aria-label={`Open Employee 360 dossier for ${record.entity.name}`}
                      >
                        {content}
                      </button>
                    ) : (
                      <div className="rounded-[0.65rem] bg-white/[0.025] px-2.5 py-2">
                        {content}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

export function EmployeeRelationshipMap({
  employee,
  clients = [],
  evaluators = [],
  network = null,
  onPivotEmployee,
  tone = 'primary',
  initialLayers,
  maxGraphNodes = DEFAULT_GRAPH_NODES,
  height = 560,
  className,
  ariaLabel,
}: EmployeeRelationshipMapProps) {
  const reduceMotion = Boolean(useReducedMotion())
  const headingIdPrefix = useId()
  const flowRef = useRef<ReactFlowInstance<RelationshipNodeData> | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('map')
  const [activeLayers, setActiveLayers] = useState<
    Record<EmployeeRelationshipLayer, boolean>
  >(() => ({
    clients: initialLayers?.clients ?? true,
    leads: initialLayers?.leads ?? true,
    reports: initialLayers?.reports ?? true,
    evaluators: initialLayers?.evaluators ?? true,
    colleagues: initialLayers?.colleagues ?? true,
  }))

  const employeeId = cleanText(employee.id)
  const employeeName = cleanText(employee.name) ?? 'Selected employee'
  const subjectAccent = tone === 'comparison' ? CYAN : AMBER
  const graphLimit = Math.min(
    MAX_SAFE_GRAPH_NODES,
    Math.max(8, Math.floor(Number.isFinite(maxGraphNodes) ? maxGraphNodes : DEFAULT_GRAPH_NODES))
  )

  const allRecords = useMemo(
    () =>
      normalizeRelations({
        employeeId,
        clients,
        evaluators,
        network,
      }),
    [employeeId, clients, evaluators, network]
  )

  const layerCounts = useMemo(
    () =>
      Object.fromEntries(
        LAYERS.map((layer) => [
          layer,
          allRecords.filter((record) => record.layer === layer).length,
        ])
      ) as Record<EmployeeRelationshipLayer, number>,
    [allRecords]
  )

  const activeRecords = useMemo(
    () => allRecords.filter((record) => activeLayers[record.layer]),
    [allRecords, activeLayers]
  )
  const allGraphEntities = useMemo(() => coalesceRecords(activeRecords), [activeRecords])
  const graphEntities = useMemo(
    () => capGraphEntities(allGraphEntities, graphLimit),
    [allGraphEntities, graphLimit]
  )

  const scene = useMemo(() => {
    const nodes: Array<Node<RelationshipNodeData>> = [
      {
        id: 'employee-360-subject',
        type: 'employee360Relationship',
        position: { x: -112, y: -43 },
        draggable: false,
        selectable: false,
        connectable: false,
        focusable: false,
        ariaLabel: `${employeeName}, selected ${tone === 'comparison' ? 'comparison' : 'primary'} employee`,
        data: {
          kind: 'subject',
          title: employeeName,
          eyebrow: tone === 'comparison' ? 'Comparison dossier' : 'Primary dossier',
          detail: personDetail(employee),
          accent: subjectAccent,
          attention: false,
          pivotId: null,
        },
      },
    ]
    const edges: Array<Edge> = []

    for (const layer of LAYERS) {
      const group = graphEntities
        .filter((entity) => entity.primaryLayer === layer)
        .sort((left, right) => compareText(left.entity, right.entity))

      group.forEach((graphEntity, index) => {
        const position = positionOnSector(layer, index, group.length)
        const handles = edgeHandles(position)
        const nodeId = `employee-360-${graphEntity.entity.key}`
        const labels = graphEntity.records.map((record) => record.edgeLabel)
        const edgeLabel = compactLabel(labels)
        const layerLabels = graphEntity.records.map(
          (record) => LAYER_META[record.layer].singular
        )
        const detail =
          graphEntity.entity.detail ??
          (layerLabels.length > 1 ? `${layerLabels.length} relationship types` : null)

        nodes.push({
          id: nodeId,
          type: 'employee360Relationship',
          position,
          draggable: false,
          selectable: false,
          connectable: false,
          focusable: false,
          ariaLabel: `${graphEntity.entity.name}, ${compactLabel(layerLabels, 80)}`,
          data: {
            kind: graphEntity.entity.kind,
            title: graphEntity.entity.name,
            eyebrow: compactLabel(layerLabels, 40),
            detail,
            accent: LAYER_META[layer].color,
            attention: graphEntity.entity.attention,
            pivotId:
              graphEntity.entity.kind === 'person' ? graphEntity.entity.id : null,
            onPivotEmployee,
          },
        })

        edges.push({
          id: `edge-${nodeId}`,
          source: 'employee-360-subject',
          target: nodeId,
          sourceHandle: handles.sourceHandle,
          targetHandle: handles.targetHandle,
          type: 'smoothstep',
          label: edgeLabel,
          ariaLabel: `${employeeName} to ${graphEntity.entity.name}: ${edgeLabel}`,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            width: 13,
            height: 13,
            color: LAYER_META[layer].color,
          },
          style: {
            stroke: LAYER_META[layer].color,
            strokeWidth: 1.15,
            strokeOpacity: 0.62,
          },
          labelStyle: {
            fill: BONE,
            fontSize: 10,
          },
          labelBgStyle: {
            fill: GRAPHITE,
            fillOpacity: 0.92,
          },
          labelBgPadding: [5, 3],
          labelBgBorderRadius: 4,
        })
      })
    }

    return { nodes, edges }
  }, [employee, employeeName, graphEntities, onPivotEmployee, subjectAccent, tone])

  const sceneKey = scene.nodes.map((node) => node.id).join('|')

  const fitScene = useCallback(
    (instance: ReactFlowInstance<RelationshipNodeData>) => {
      const frame = window.requestAnimationFrame(() => {
        instance.fitView({
          padding: 0.17,
          minZoom: 0.32,
          maxZoom: 1.05,
          duration: reduceMotion ? 0 : 360,
        })
      })
      return () => window.cancelAnimationFrame(frame)
    },
    [reduceMotion]
  )

  useEffect(() => {
    const instance = flowRef.current
    if (!instance || viewMode !== 'map') return
    return fitScene(instance)
  }, [fitScene, sceneKey, viewMode])

  const toggleLayer = (layer: EmployeeRelationshipLayer) => {
    setActiveLayers((current) => ({ ...current, [layer]: !current[layer] }))
  }

  const hiddenGraphNodes = Math.max(0, allGraphEntities.length - graphEntities.length)
  const populatedLayerCount = LAYERS.filter((layer) => layerCounts[layer] > 0).length

  return (
    <section
      className={cn(styles.shell, className)}
      aria-label={ariaLabel ?? `Relationship network for ${employeeName}`}
    >
      <div className="relative z-[2] border-b border-[#243246] bg-[#080D16]/75 px-3 py-3 backdrop-blur-sm sm:px-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Network className="h-4 w-4 shrink-0" style={{ color: subjectAccent }} aria-hidden />
              <h3 className="truncate text-sm font-semibold text-[#EEE8D8]">
                Relationship map
              </h3>
              <span
                className="rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em]"
                style={{
                  borderColor: `${subjectAccent}55`,
                  backgroundColor: `${subjectAccent}12`,
                  color: subjectAccent,
                }}
              >
                {tone}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-[#98A3B3]">
              Verified Compass relationships. Select a person to pivot their dossier.
            </p>
          </div>

          <div
            className="inline-flex w-fit rounded-lg border border-[#243246] bg-[#080D16] p-0.5"
            aria-label="Relationship visualization mode"
          >
            <button
              type="button"
              onClick={() => setViewMode('map')}
              aria-pressed={viewMode === 'map'}
              className={cn(
                'inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#68C7D4]',
                viewMode === 'map'
                  ? 'bg-[#1A2938] text-[#EEE8D8]'
                  : 'text-[#98A3B3] hover:text-[#EEE8D8]'
              )}
            >
              <GitFork className="h-3.5 w-3.5" aria-hidden />
              Map
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              aria-pressed={viewMode === 'list'}
              className={cn(
                'inline-flex min-h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#68C7D4]',
                viewMode === 'list'
                  ? 'bg-[#1A2938] text-[#EEE8D8]'
                  : 'text-[#98A3B3] hover:text-[#EEE8D8]'
              )}
            >
              <ListTree className="h-3.5 w-3.5" aria-hidden />
              Structured view
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Relationship layers">
          {LAYERS.map((layer) => {
            const meta = LAYER_META[layer]
            const active = activeLayers[layer]
            const count = layerCounts[layer]
            return (
              <button
                key={layer}
                type="button"
                onClick={() => toggleLayer(layer)}
                disabled={count === 0}
                aria-pressed={active}
                aria-label={`${active ? 'Hide' : 'Show'} ${meta.label}, ${count} relationship${count === 1 ? '' : 's'}`}
                className={cn(
                  'inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 font-mono text-[10px] uppercase tracking-[0.08em] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#68C7D4] disabled:cursor-not-allowed disabled:opacity-35',
                  active ? 'bg-white/[0.055]' : 'border-[#243246] bg-transparent text-[#7D899A]'
                )}
                style={
                  active
                    ? {
                        borderColor: `${meta.color}55`,
                        color: meta.color,
                      }
                    : undefined
                }
              >
                {layerIcon(layer)}
                {meta.label}
                <span className="text-[#98A3B3]">{count}</span>
              </button>
            )
          })}
        </div>
      </div>

      {viewMode === 'map' ? (
        <div
          className={styles.map}
          style={{ height }}
          role="group"
          aria-label={`Interactive relationship graph for ${employeeName}`}
        >
          {graphEntities.length === 0 ? (
            <div className="flex h-full items-center justify-center p-8 text-center">
              <div>
                <Network className="mx-auto h-9 w-9 text-slate-600" aria-hidden />
                <p className="mt-3 text-sm font-medium text-[#EEE8D8]">
                  {populatedLayerCount === 0
                    ? 'No verified relationships available'
                    : 'No relationship layers selected'}
                </p>
                <p className="mt-1 text-xs text-[#98A3B3]">
                  {populatedLayerCount === 0
                    ? 'This is missing evidence, not a zero relationship count.'
                    : 'Turn on a layer above to rebuild the map.'}
                </p>
              </div>
            </div>
          ) : (
            <ReactFlow
              nodes={scene.nodes}
              edges={scene.edges}
              nodeTypes={nodeTypes}
              onInit={(instance) => {
                flowRef.current = instance
                fitScene(instance)
              }}
              proOptions={{ hideAttribution: true }}
              nodesDraggable={false}
              nodesConnectable={false}
              nodesFocusable={false}
              edgesFocusable={false}
              elementsSelectable={false}
              panOnScroll
              zoomOnDoubleClick={false}
              minZoom={0.25}
              maxZoom={1.4}
            >
              <Background color="#25364A" gap={24} size={1} />
              <Controls
                showInteractive={false}
                position="bottom-right"
                aria-label="Relationship map zoom controls"
              />
            </ReactFlow>
          )}

          {hiddenGraphNodes > 0 && (
            <div
              className="pointer-events-none absolute bottom-3 left-3 z-10 max-w-[18rem] rounded-lg border border-[#EF7C68]/30 bg-[#080D16]/95 px-3 py-2 shadow-xl"
              role="status"
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#EF7C68]">
                Dense network · {hiddenGraphNodes} graph node{hiddenGraphNodes === 1 ? '' : 's'} omitted
              </p>
              <p className="mt-0.5 text-[10px] leading-4 text-[#98A3B3]">
                Narrow the layers or use Structured view for the complete relationship list.
              </p>
            </div>
          )}
        </div>
      ) : (
        <StructuredRelationshipList
          records={allRecords}
          activeLayers={activeLayers}
          onPivotEmployee={onPivotEmployee}
          headingIdPrefix={headingIdPrefix}
        />
      )}

      <div className="relative z-[2] flex flex-wrap items-center justify-between gap-2 border-t border-[#243246] bg-[#080D16]/75 px-3 py-2 font-mono text-[9px] uppercase tracking-[0.09em] text-[#98A3B3] sm:px-4">
        <span>
          {allGraphEntities.length} connected object{allGraphEntities.length === 1 ? '' : 's'} ·{' '}
          {activeRecords.length} active link{activeRecords.length === 1 ? '' : 's'}
        </span>
        <span className="flex items-center gap-3" aria-label="Map color legend">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: AMBER }}
              aria-hidden
            />
            Primary
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: CYAN }}
              aria-hidden
            />
            Comparison
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: CORAL }}
              aria-hidden
            />
            Provisional
          </span>
        </span>
      </div>
    </section>
  )
}
