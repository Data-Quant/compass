'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  Activity,
  Archive,
  ArrowDownRight,
  ArrowUpRight,
  BadgeInfo,
  BriefcaseBusiness,
  CalendarClock,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Database,
  GitCompareArrows,
  History,
  Info,
  ListFilter,
  Menu,
  Network,
  PanelRightOpen,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  Target,
  TrendingUp,
  UserRoundSearch,
  Users,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  directoryPayloadSchema,
  evidencePayloadSchema,
  profilePayloadSchema,
  type Availability,
  type DirectoryEmployee,
  type DirectoryPayload,
  type EmployeeDossier,
  type EvidencePayload,
  type ProfilePayload,
} from '@/lib/analytics/employee-360-contracts'
import {
  EMPLOYEE_360_DOMAINS,
  parseEmployee360UrlState,
  updateEmployee360SearchParams,
  type Employee360Domain,
  type Employee360UrlState,
} from '@/lib/analytics/employee-360-url-state'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AvailabilityMark,
  CockpitPanel,
  CockpitTimeline,
  SignalTile,
  SubjectRail,
  type CockpitAvailability,
  type CockpitTimelineEvent,
  type DirectoryPerson,
} from './Employee360CockpitParts'
import {
  CompensationTrajectory,
  EvaluationTrajectory,
  LensMatrix,
  type CompensationPoint,
  type EvaluationHistoryPoint,
  type LensReadout,
} from './Employee360Visuals'
import { EmployeeRelationshipMap } from './EmployeeRelationshipMap'
import styles from './Employee360Cockpit.module.css'

type Domain = Employee360Domain
type EvidenceDomain =
  | 'EVALUATION'
  | 'SELF_EVALUATION'
  | 'CLIENTS'
  | 'COMPENSATION'
  | 'OPERATIONS'
  | 'NETWORK'

interface InspectionTarget {
  domain: EvidenceDomain
  title: string
  lens?: string | null
}

const DOMAINS: Domain[] = [...EMPLOYEE_360_DOMAINS]

const DOMAIN_LABELS: Record<Domain, string> = {
  overview: 'Overview',
  evaluation: 'Evaluation',
  clients: 'Clients & network',
  compensation: 'Compensation & capacity',
  timeline: 'Timeline',
}

const LENS_LABELS: Record<string, string> = {
  TEAM_LEAD: 'Team lead',
  PEER: 'Peer',
  HR: 'HR',
  DEPT: 'Department',
  DIRECT_REPORT: 'Direct reports',
  C_LEVEL: 'C-level',
  CROSS_DEPARTMENT: 'Cross-department',
  SELF: 'Self',
}

const FINALIZED_PROFILE_CACHE_LIMIT = 28
// Module-scoped on the client so revisiting the cockpit during the same app
// session can reuse validated dossiers without persisting HR data to disk.
const visitedProfileCache = new Map<string, ProfilePayload>()

function asAvailability(value: Availability): CockpitAvailability {
  return value
}

function formatPercent(value: number | null, digits = 0) {
  return value === null ? '—' : `${value.toFixed(digits)}%`
}

function formatSigned(value: number | null, suffix = '') {
  if (value === null) return '—'
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}${suffix}`
}

function formatMoney(amount: number | null, currency: string | null) {
  if (amount === null) return '—'
  return `${currency ? `${currency} ` : ''}${Math.round(amount).toLocaleString()}`
}

function formatDate(value: string | null, options?: Intl.DateTimeFormatOptions) {
  if (!value) return 'Not recorded'
  return new Date(value).toLocaleDateString(
    undefined,
    options ?? { day: '2-digit', month: 'short', year: 'numeric' }
  )
}

function describeTenure(joinedAt: string | null) {
  if (!joinedAt) return 'Join date unavailable'
  const started = new Date(joinedAt)
  const now = new Date()
  const totalMonths = Math.max(
    0,
    (now.getUTCFullYear() - started.getUTCFullYear()) * 12 +
      now.getUTCMonth() -
      started.getUTCMonth()
  )
  if (totalMonths < 1) return 'Joined this month'
  if (totalMonths < 12) return `${totalMonths} month${totalMonths === 1 ? '' : 's'} tenure`
  const years = Math.floor(totalMonths / 12)
  const months = totalMonths % 12
  return `${years}y${months ? ` ${months}m` : ''} tenure`
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function performanceTone(value: number | null): 'positive' | 'attention' | 'primary' | 'neutral' {
  if (value === null) return 'neutral'
  if (value >= 75) return 'positive'
  if (value < 50) return 'attention'
  return 'primary'
}

function momentumTone(value: number | null): 'positive' | 'attention' | 'neutral' {
  if (value === null || value === 0) return 'neutral'
  return value > 0 ? 'positive' : 'attention'
}

function makeDirectoryPerson(person: DirectoryEmployee): DirectoryPerson {
  const available = Object.values(person.dataCoverage).filter((item) => item === 'AVAILABLE').length
  const partial = Object.values(person.dataCoverage).filter((item) => item === 'PARTIAL').length
  return {
    id: person.id,
    name: person.name,
    department: person.department,
    position: person.position,
    status: person.employmentStatus,
    dataCoverage: (available + partial * 0.5) / 5,
  }
}

function timelineEvents(dossier: EmployeeDossier): CockpitTimelineEvent[] {
  return dossier.timeline.map((event) => ({
    id: event.id,
    date: event.occurredAt,
    domain: event.kind.replace('_', ' '),
    title: event.title,
    detail: event.detail,
    source: event.source,
    asOf: event.asOf,
    tone:
      event.kind === 'COMPENSATION'
        ? 'primary'
        : event.kind === 'EVALUATION'
          ? 'comparison'
          : 'neutral',
  }))
}

function evaluationHistory(dossier: EmployeeDossier): EvaluationHistoryPoint[] {
  return dossier.evaluation.history.map((point) => ({
    periodId: point.period.id,
    label: point.period.name,
    score: point.overallScore,
  }))
}

function lensReadouts(dossier: EmployeeDossier): LensReadout[] {
  return dossier.evaluation.lenses.map((lens) => ({
    lens: lens.relationshipType,
    label: LENS_LABELS[lens.relationshipType] ?? lens.relationshipType,
    score: lens.score,
    organizationAverage: lens.orgAverage,
    evaluatorCount: lens.evaluatorCount,
    isSelf: lens.relationshipType === 'SELF',
  }))
}

function compensationHistory(dossier: EmployeeDossier): CompensationPoint[] {
  return dossier.compensation.history.map((point) => ({
    date: point.effectiveFrom,
    total: point.amount,
    currency: point.currency,
  }))
}

function profileCacheKey(employeeId: string, periodId: string | null, compareId: string | null) {
  return `${employeeId}:${periodId ?? 'latest'}:${compareId ?? 'none'}`
}

function useDesktopBreakpoint() {
  const [isDesktop, setIsDesktop] = useState(false)

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)')
    const update = () => setIsDesktop(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  return isDesktop
}

function LoadingCockpit() {
  return (
    <div className="space-y-4 p-4 sm:p-6" aria-label="Loading employee intelligence">
      <div className="flex items-center gap-4">
        <Skeleton className={cn('h-16 w-16 rounded-xl', styles.shimmer)} />
        <div className="flex-1 space-y-2">
          <Skeleton className={cn('h-7 w-64 max-w-full', styles.shimmer)} />
          <Skeleton className={cn('h-3 w-80 max-w-full', styles.shimmer)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {Array.from({ length: 7 }).map((_, index) => (
          <Skeleton key={index} className={cn('h-[118px] rounded-xl', styles.shimmer)} />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.7fr)]">
        <Skeleton className={cn('h-[520px] rounded-xl', styles.shimmer)} />
        <Skeleton className={cn('h-[520px] rounded-xl', styles.shimmer)} />
      </div>
    </div>
  )
}

function StructuredEvidenceValue({
  value,
}: {
  value: NonNullable<EvidencePayload['items'][number]['structuredResponse']>
}) {
  if (value.type === 'TEXT') {
    return (
      <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-[#A5AEBC]">
        {value.value || 'No written response.'}
      </p>
    )
  }

  if (value.type === 'LIST') {
    return value.value.length ? (
      <ul className="mt-3 space-y-2">
        {value.value.map((entry, index) => (
          <li
            key={`${entry}-${index}`}
            className="flex gap-2 text-xs leading-relaxed text-[#A5AEBC]"
          >
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[#79B8D8]" />
            <span>{entry}</span>
          </li>
        ))}
      </ul>
    ) : (
      <p className="mt-2 text-xs text-[#718096]">No list items were submitted.</p>
    )
  }

  return value.value.length ? (
    <div className="mt-3 space-y-2">
      {value.value.map((goal, index) => (
        <div
          key={`${goal.goal}-${index}`}
          className="rounded-md border border-[#8197B2]/15 bg-[#09111B] p-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-xs font-medium leading-relaxed text-[#D9D7CF]">
              {goal.goal}
            </p>
            <span className="rounded-full border border-[#79B8D8]/25 bg-[#79B8D8]/10 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.1em] text-[#79B8D8]">
              {goal.status.replaceAll('_', ' ')}
            </span>
          </div>
          {goal.comments && (
            <p className="mt-2 whitespace-pre-wrap text-[11px] leading-relaxed text-[#8D99AA]">
              {goal.comments}
            </p>
          )}
        </div>
      ))}
    </div>
  ) : (
    <p className="mt-2 text-xs text-[#718096]">No goals were submitted.</p>
  )
}

function ErrorState({
  title,
  detail,
  onRetry,
}: {
  title: string
  detail: string
  onRetry: () => void
}) {
  return (
    <div className="flex min-h-[480px] items-center justify-center p-6">
      <div className="max-w-md rounded-xl border border-[#E57B69]/25 bg-[#E57B69]/5 p-6 text-center">
        <BadgeInfo className="mx-auto h-7 w-7 text-[#E57B69]" />
        <h2 className="mt-3 text-lg font-semibold text-[#ECE8DC]">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-[#8D99AA]">{detail}</p>
        <Button
          type="button"
          variant="outline"
          className="mt-5 border-[#E57B69]/30 bg-transparent text-[#ECE8DC] hover:bg-[#E57B69]/10 hover:text-[#ECE8DC]"
          onClick={onRetry}
        >
          <RefreshCw className="h-4 w-4" />
          Retry
        </Button>
      </div>
    </div>
  )
}

function EvidenceDrawer({
  open,
  onOpenChange,
  inspection,
  dossier,
  evidence,
  loading,
  error,
  revealEvaluator,
  onRevealEvaluator,
  onRetry,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  inspection: InspectionTarget | null
  dossier: EmployeeDossier | null
  evidence: EvidencePayload | null
  loading: boolean
  error: string | null
  revealEvaluator: boolean
  onRevealEvaluator: (value: boolean) => void
  onRetry: () => void
}) {
  const isDesktop = useDesktopBreakpoint()
  const remote =
    inspection?.domain === 'EVALUATION' || inspection?.domain === 'SELF_EVALUATION'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isDesktop ? 'right' : 'bottom'}
        className={cn(
          'border-[#8197B2]/25 bg-[#090F18] p-0 text-[#ECE8DC]',
          isDesktop ? 'w-full sm:max-w-xl' : 'h-[86vh] w-full'
        )}
      >
        <SheetHeader className="border-b border-[#8197B2]/20 px-5 py-5 pr-14 text-left">
          <div className="flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-[#E6BC58]">
            <Database className="h-3.5 w-3.5" />
            Evidence layer
          </div>
          <SheetTitle className="text-xl text-[#ECE8DC]">
            {inspection?.title ?? 'Source evidence'}
          </SheetTitle>
          <SheetDescription className="text-xs leading-relaxed text-[#8D99AA]">
            Read-only source records and methodology. No signal on this surface changes an
            employee record.
          </SheetDescription>
        </SheetHeader>

        <div className={cn('h-full overflow-y-auto px-5 pb-28 pt-5', styles.rail)}>
          {!inspection || !dossier ? (
            <p className="text-sm text-[#8D99AA]">Choose a signal to inspect its evidence.</p>
          ) : remote ? (
            <>
              <div className="mb-5 flex items-center justify-between gap-4 rounded-lg border border-[#8197B2]/20 bg-[#0E1724] p-3">
                <div>
                  <p className="text-[9px] uppercase tracking-[0.15em] text-[#718096]">
                    Attribution
                  </p>
                  <p className="mt-1 text-xs text-[#B5BDCA]">
                    Relationship lens is shown first. Evaluator identity is available to HR on
                    explicit reveal.
                  </p>
                </div>
                {inspection.domain === 'EVALUATION' && (
                  <button
                    type="button"
                    onClick={() => onRevealEvaluator(!revealEvaluator)}
                    aria-pressed={revealEvaluator}
                    className={cn(
                      'shrink-0 rounded-md border px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-[0.12em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E6BC58]',
                      revealEvaluator
                        ? 'border-[#E6BC58]/35 bg-[#E6BC58]/10 text-[#E6BC58]'
                        : 'border-[#8197B2]/25 text-[#8D99AA] hover:text-[#ECE8DC]'
                    )}
                  >
                    {revealEvaluator ? 'Names shown' : 'Reveal names'}
                  </button>
                )}
              </div>

              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={index} className={cn('h-32 rounded-lg', styles.shimmer)} />
                  ))}
                </div>
              ) : error ? (
                <div className="rounded-lg border border-[#E57B69]/25 bg-[#E57B69]/5 p-4">
                  <p className="text-sm text-[#E7A094]">{error}</p>
                  <button
                    type="button"
                    onClick={onRetry}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs text-[#ECE8DC] underline underline-offset-4"
                  >
                    <RefreshCw className="h-3 w-3" /> Retry evidence
                  </button>
                </div>
              ) : !evidence?.items.length ? (
                <div className="rounded-lg border border-dashed border-[#8197B2]/20 p-8 text-center text-sm text-[#8D99AA]">
                  No submitted narrative or rating evidence is available for this period.
                </div>
              ) : (
                <div className="space-y-3">
                  {evidence.items.map((item) => (
                    <article
                      key={item.id}
                      className="rounded-lg border border-[#8197B2]/20 bg-[#0E1724] p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span
                          className={cn(
                            'rounded-full border px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em]',
                            item.lens === 'SELF'
                              ? 'border-[#79B8D8]/30 bg-[#79B8D8]/10 text-[#79B8D8]'
                              : 'border-[#E6BC58]/30 bg-[#E6BC58]/10 text-[#E6BC58]'
                          )}
                        >
                          {LENS_LABELS[item.lens] ?? item.lens}
                        </span>
                        <span className="font-mono text-xs text-[#ECE8DC]">
                          {item.rating === null ? 'Narrative' : `${item.rating.toFixed(1)} / 4`}
                        </span>
                      </div>
                      <h3 className="mt-3 text-xs font-semibold leading-relaxed text-[#D9D7CF]">
                        {item.question}
                      </h3>
                      {item.structuredResponse ? (
                        <StructuredEvidenceValue value={item.structuredResponse} />
                      ) : (
                        <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-[#A5AEBC]">
                          {item.response || 'No written response.'}
                        </p>
                      )}
                      <div className="mt-4 border-t border-[#8197B2]/15 pt-3 text-[9px] uppercase tracking-[0.12em] text-[#66758A]">
                        {item.evaluator.isRevealed && item.evaluator.name
                          ? item.evaluator.name
                          : item.lens === 'SELF'
                            ? 'Employee self-evaluation'
                            : `Evaluator ${item.evaluator.raterKey.slice(0, 8)}`}
                        {' · '}
                        {item.provenance.periodName}
                        {' · '}
                        {formatDate(item.provenance.submittedAt)}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </>
          ) : (
            <LocalEvidence inspection={inspection} dossier={dossier} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function EvidenceFact({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail?: string
}) {
  return (
    <div className="rounded-lg border border-[#8197B2]/20 bg-[#0E1724] p-4">
      <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[#718096]">
        {label}
      </p>
      <p className="mt-2 font-mono text-lg text-[#ECE8DC]">{value}</p>
      {detail && <p className="mt-1 text-xs leading-relaxed text-[#8D99AA]">{detail}</p>}
    </div>
  )
}

function LocalEvidence({
  inspection,
  dossier,
}: {
  inspection: InspectionTarget
  dossier: EmployeeDossier
}) {
  if (inspection.domain === 'CLIENTS') {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-[#E6BC58]/25 bg-[#E6BC58]/5 p-4 text-xs leading-relaxed text-[#C8B77E]">
          Compass stores current client roster responsibility, not revenue, satisfaction, renewal,
          or delivery outcomes. These records describe verified coverage and connectivity—not
          business impact.
        </div>
        {dossier.clientFootprint.assignments.map((assignment) => (
          <div
            key={assignment.clientId}
            className="rounded-lg border border-[#8197B2]/20 bg-[#0E1724] p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-[#ECE8DC]">{assignment.clientName}</h3>
              <span className="rounded-full border border-[#79B8D8]/25 bg-[#79B8D8]/10 px-2 py-1 text-[9px] uppercase tracking-[0.12em] text-[#79B8D8]">
                {assignment.role}
              </span>
            </div>
            <p className="mt-2 text-xs text-[#8D99AA]">
              Recorded since {formatDate(assignment.assignedAt)} · {assignment.tenureDays} days ·{' '}
              {assignment.teamSize ?? 'unknown'} roster size
            </p>
            <p className="mt-3 text-[9px] uppercase tracking-[0.12em] text-[#66758A]">
              Source · active client assignment
            </p>
          </div>
        ))}
        {!dossier.clientFootprint.assignments.length && (
          <p className="rounded-lg border border-dashed border-[#8197B2]/20 p-8 text-center text-sm text-[#8D99AA]">
            No active client roster assignments.
          </p>
        )}
      </div>
    )
  }

  if (inspection.domain === 'COMPENSATION') {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-[#8197B2]/20 bg-[#0E1724] p-4 text-xs leading-relaxed text-[#8D99AA]">
          Basic salary is observed from finalized payroll evidence. Unchanged months are collapsed
          into change events. This view makes no market, equity, or performance-causality claim.
        </div>
        <div className="grid grid-cols-2 gap-3">
          <EvidenceFact
            label="Current basic"
            value={formatMoney(
              dossier.compensation.currentBasic,
              dossier.compensation.currency
            )}
          />
          <EvidenceFact
            label="Observed growth"
            value={formatSigned(dossier.compensation.growth, '%')}
          />
        </div>
        {dossier.compensation.changeEvents.map((event) => (
          <div
            key={`${event.currency}-${event.effectiveFrom}`}
            className="rounded-lg border border-[#8197B2]/20 bg-[#0E1724] p-4"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-[#B5BDCA]">{formatDate(event.effectiveFrom)}</p>
                <p className="mt-1 font-mono text-sm text-[#ECE8DC]">
                  {formatMoney(event.previousAmount, event.currency)} →{' '}
                  {formatMoney(event.amount, event.currency)}
                </p>
              </div>
              <span
                className={cn(
                  'font-mono text-xs',
                  event.delta >= 0 ? 'text-[#5DC1A7]' : 'text-[#E57B69]'
                )}
              >
                {event.percentChange === null
                  ? formatMoney(event.delta, event.currency)
                  : formatSigned(event.percentChange, '%')}
              </span>
            </div>
            <p className="mt-3 text-[9px] uppercase tracking-[0.12em] text-[#66758A]">
              Source · finalized payroll · {event.periodName ?? 'period unavailable'}
            </p>
          </div>
        ))}
      </div>
    )
  }

  if (inspection.domain === 'OPERATIONS') {
    const operationsAvailable = dossier.availability.operations !== 'NO_DATA'
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-[#E6BC58]/25 bg-[#E6BC58]/5 p-4 text-xs leading-relaxed text-[#C8B77E]">
          Work and leave records are capacity context only. They never contribute to performance,
          readiness, or commitment scoring.
        </div>
        <div className="grid grid-cols-2 gap-3">
          <EvidenceFact
            label="Open tasks"
            value={operationsAvailable ? String(dossier.operations.openTasks) : '—'}
          />
          <EvidenceFact
            label="Overdue"
            value={operationsAvailable ? String(dossier.operations.overdueTasks) : '—'}
          />
          <EvidenceFact
            label="Recent completions"
            value={operationsAvailable ? String(dossier.operations.recentCompletions) : '—'}
          />
          <EvidenceFact
            label="Approved leave"
            value={
              operationsAvailable
                ? `${dossier.operations.approvedWorkingLeaveDays} working days`
                : '—'
            }
          />
        </div>
        <p className="text-[9px] uppercase tracking-[0.12em] text-[#66758A]">
          As of {formatDate(dossier.operations.asOf)} · tasks and approved leave
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="rounded-lg border border-[#8197B2]/20 bg-[#0E1724] p-4 text-xs leading-relaxed text-[#8D99AA]">
        This network is assembled from verified evaluation mappings and active shared-client
        assignments. Edge labels explain why each person appears.
      </p>
      {dossier.network.edges.map((edge) => (
        <div
          key={edge.id}
          className="flex items-center justify-between gap-4 rounded-lg border border-[#8197B2]/20 bg-[#0E1724] p-4"
        >
          <div>
            <p className="text-sm text-[#ECE8DC]">{edge.person.name}</p>
            <p className="mt-1 text-xs text-[#8D99AA]">
              {edge.person.position || 'Position unavailable'}
            </p>
          </div>
          <span className="rounded-full border border-[#79B8D8]/25 bg-[#79B8D8]/10 px-2 py-1 text-[9px] uppercase tracking-[0.12em] text-[#79B8D8]">
            {edge.label}
          </span>
        </div>
      ))}
    </div>
  )
}

function ProfileHeader({
  dossier,
  comparison,
  generatedAt,
  onClearComparison,
}: {
  dossier: EmployeeDossier
  comparison: EmployeeDossier | null
  generatedAt: string
  onClearComparison: () => void
}) {
  return (
    <div className="mb-4 rounded-xl border border-[#8197B2]/20 bg-[#0A111C]/80 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex min-w-0 items-center gap-4">
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-[#E6BC58]/35 bg-[#E6BC58]/10">
            <span className="font-mono text-xl font-semibold tracking-[-0.04em] text-[#ECE8DC]">
              {initials(dossier.identity.name)}
            </span>
            <span
              className={cn(
                'absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-[#0A111C]',
                dossier.employment.status === 'ACTIVE' ? 'bg-[#5DC1A7]' : 'bg-[#718096]'
              )}
              title={dossier.employment.status === 'ACTIVE' ? 'Active employee' : 'Archived employee'}
            />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl font-semibold tracking-[-0.035em] text-[#F3EFE4] sm:text-3xl">
                {dossier.identity.name}
              </h1>
              <span
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.13em]',
                  dossier.employment.status === 'ACTIVE'
                    ? 'border-[#5DC1A7]/25 bg-[#5DC1A7]/10 text-[#76D2BA]'
                    : 'border-[#8197B2]/20 bg-[#8197B2]/5 text-[#8D99AA]'
                )}
              >
                {dossier.employment.status}
              </span>
            </div>
            <p className="mt-1 text-xs text-[#8D99AA]">
              {[dossier.identity.position, dossier.identity.department].filter(Boolean).join(' · ') ||
                'Role not recorded'}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[9px] uppercase tracking-[0.12em] text-[#66758A]">
              <span className="inline-flex items-center gap-1.5">
                <Clock3 className="h-3 w-3" /> {describeTenure(dossier.employment.joinedAt)}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Database className="h-3 w-3" /> generated {formatDate(generatedAt)}
              </span>
            </div>
          </div>
        </div>

        {comparison && (
          <div className="rounded-lg border border-[#79B8D8]/30 bg-[#79B8D8]/8 px-3 py-2">
            <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[#79B8D8]">
              comparison subject
            </p>
            <div className="mt-1 flex items-center gap-3">
              <span className="text-xs font-medium text-[#D9E9F1]">
                {comparison.identity.name}
              </span>
              <button
                type="button"
                onClick={onClearComparison}
                className="rounded p-1 text-[#79B8D8] hover:bg-[#79B8D8]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#79B8D8]"
                aria-label={`Stop comparing with ${comparison.identity.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function SignalStripView({
  dossier,
  comparison,
  onInspect,
}: {
  dossier: EmployeeDossier
  comparison: EmployeeDossier | null
  onInspect: (target: InspectionTarget) => void
}) {
  const primary = dossier.signals
  const compare = comparison?.signals ?? null
  const workload = primary.workload
  const compareWorkload = compare?.workload ?? null

  return (
    <div className="mb-4 grid grid-cols-2 gap-2.5 md:grid-cols-4 xl:grid-cols-7">
      <SignalTile
        label="Performance"
        value={formatPercent(primary.performance)}
        comparisonValue={
          compare?.performance === null || compare?.performance === undefined
            ? null
            : formatPercent(compare.performance)
        }
        detail={dossier.evaluation.performanceBand || 'Weighted evaluation score'}
        availability={asAvailability(dossier.availability.evaluation)}
        tone={performanceTone(primary.performance)}
        onInspect={() =>
          onInspect({ domain: 'EVALUATION', title: 'Performance evidence' })
        }
      />
      <SignalTile
        label="Momentum"
        value={formatSigned(primary.momentum)}
        comparisonValue={
          compare?.momentum === null || compare?.momentum === undefined
            ? null
            : formatSigned(compare.momentum)
        }
        detail={dossier.evaluation.momentumBand || 'Change from comparable prior period'}
        availability={asAvailability(dossier.availability.evaluation)}
        tone={momentumTone(primary.momentum)}
        onInspect={() =>
          onInspect({ domain: 'EVALUATION', title: 'Evaluation trajectory evidence' })
        }
      />
      <SignalTile
        label="Consensus"
        value={
          primary.evaluatorConsensus === null
            ? '—'
            : `${(primary.evaluatorConsensus * 100).toFixed(0)}%`
        }
        comparisonValue={
          compare?.evaluatorConsensus === null || compare?.evaluatorConsensus === undefined
            ? null
            : `${(compare.evaluatorConsensus * 100).toFixed(0)}%`
        }
        detail="Agreement across external evaluation lenses"
        availability={asAvailability(dossier.availability.evaluation)}
        tone={
          primary.evaluatorConsensus !== null && primary.evaluatorConsensus < 0.5
            ? 'attention'
            : 'neutral'
        }
        onInspect={() =>
          onInspect({ domain: 'EVALUATION', title: 'Evaluator consensus evidence' })
        }
      />
      <SignalTile
        label="Client footprint"
        value={
          primary.clientFootprint === null ? '—' : String(primary.clientFootprint)
        }
        comparisonValue={
          compare?.clientFootprint === null || compare?.clientFootprint === undefined
            ? null
            : String(compare.clientFootprint)
        }
        detail={`${dossier.clientFootprint.assignments.filter((item) => item.role === 'MANAGER').length} managed · coverage, not outcomes`}
        availability={asAvailability(dossier.availability.clients)}
        tone="comparison"
        onInspect={() => onInspect({ domain: 'CLIENTS', title: 'Client footprint evidence' })}
      />
      <SignalTile
        label="Current basic"
        value={formatMoney(
          primary.currentCompensation?.amount ?? null,
          primary.currentCompensation?.currency ?? null
        )}
        comparisonValue={
          compare?.currentCompensation
            ? formatMoney(
                compare.currentCompensation.amount,
                compare.currentCompensation.currency
              )
            : null
        }
        detail={
          primary.compensationChange === null
            ? 'Finalized payroll evidence'
            : `${formatSigned(primary.compensationChange, '%')} observed change`
        }
        availability={asAvailability(dossier.availability.compensation)}
        tone="primary"
        onInspect={() =>
          onInspect({ domain: 'COMPENSATION', title: 'Compensation evidence' })
        }
      />
      <SignalTile
        label="Workload"
        value={workload ? String(workload.openTasks) : '—'}
        comparisonValue={compareWorkload ? String(compareWorkload.openTasks) : null}
        detail={
          workload
            ? `${workload.overdueTasks} overdue · ${workload.recentCompletions} recent completions`
            : 'No task evidence'
        }
        availability={asAvailability(dossier.availability.operations)}
        tone={workload && workload.overdueTasks > 0 ? 'attention' : 'neutral'}
        onInspect={() => onInspect({ domain: 'OPERATIONS', title: 'Capacity evidence' })}
      />
      <SignalTile
        label="Data coverage"
        value={`${Math.round(primary.dataCompleteness * 100)}%`}
        comparisonValue={
          compare ? `${Math.round(compare.dataCompleteness * 100)}%` : null
        }
        detail="Available source domains, not a people score"
        availability={primary.dataCompleteness > 0 ? 'AVAILABLE' : 'NO_DATA'}
        tone="neutral"
        onInspect={() =>
          onInspect({ domain: 'NETWORK', title: 'Dossier source coverage' })
        }
      />
    </div>
  )
}

function RelationshipMapForDossier({
  dossier,
  onPivot,
  tone = 'primary',
  height,
}: {
  dossier: EmployeeDossier
  onPivot: (employeeId: string) => void
  tone?: 'primary' | 'comparison'
  height?: number
}) {
  const clients = dossier.clientFootprint.assignments.map((assignment) => ({
    id: assignment.clientId,
    name: assignment.clientName,
    role: assignment.role,
  }))
  const network = {
    leads: dossier.network.edges
      .filter((edge) => edge.kind === 'LEAD')
      .map((edge) => ({
        id: edge.person.employeeId,
        name: edge.person.name,
        position: edge.person.position,
      })),
    reports: dossier.network.edges
      .filter((edge) => edge.kind === 'REPORT')
      .map((edge) => ({
        id: edge.person.employeeId,
        name: edge.person.name,
        position: edge.person.position,
      })),
    colleagues: dossier.network.edges
      .filter((edge) => edge.kind === 'SHARED_CLIENT')
      .map((edge) => ({
        id: edge.person.employeeId,
        name: edge.person.name,
        position: edge.person.position,
        clients: edge.sharedClientNames,
      })),
  }
  const evaluators = dossier.network.edges
    .filter((edge) => edge.kind === 'EVALUATOR')
    .map((edge) => ({
      id: edge.person.employeeId,
      name: edge.person.name,
      relationshipType: edge.label,
    }))

  return (
    <EmployeeRelationshipMap
      employee={{
        id: dossier.identity.id,
        name: dossier.identity.name,
        position: dossier.identity.position,
        department: dossier.identity.department,
      }}
      clients={clients}
      network={network}
      evaluators={evaluators}
      onPivotEmployee={onPivot}
      tone={tone}
      height={height}
      ariaLabel={`${dossier.identity.name} relationship map`}
    />
  )
}

function OverviewDomain({
  dossier,
  comparison,
  onPivot,
  onInspect,
}: {
  dossier: EmployeeDossier
  comparison: EmployeeDossier | null
  onPivot: (employeeId: string) => void
  onInspect: (target: InspectionTarget) => void
}) {
  const selfGap = dossier.evaluation.selfVsOthersGap
  const managedClients = dossier.clientFootprint.assignments.filter(
    (assignment) => assignment.role === 'MANAGER'
  ).length
  const attentionSignals = [
    {
      label: 'Evaluation direction',
      value:
        dossier.evaluation.momentumDelta === null
          ? 'No comparable prior period'
          : dossier.evaluation.momentumDelta > 0
            ? `Improving by ${dossier.evaluation.momentumDelta.toFixed(1)} points`
            : dossier.evaluation.momentumDelta < 0
              ? `Down ${Math.abs(dossier.evaluation.momentumDelta).toFixed(1)} points`
              : 'Stable against prior period',
      tone:
        dossier.evaluation.momentumDelta === null
          ? 'neutral'
          : dossier.evaluation.momentumDelta >= 0
            ? 'positive'
            : 'attention',
    },
    {
      label: 'Lens agreement',
      value:
        dossier.evaluation.consensus === null
          ? 'Insufficient external lenses'
          : dossier.evaluation.consensus < 0.5
            ? 'Evaluator groups diverge materially'
            : 'External lenses broadly align',
      tone:
        dossier.evaluation.consensus !== null && dossier.evaluation.consensus < 0.5
          ? 'attention'
          : 'neutral',
    },
    {
      label: 'Client responsibility',
      value: dossier.clientFootprint.assignments.length
        ? `${dossier.clientFootprint.assignments.length} active roster${dossier.clientFootprint.assignments.length === 1 ? '' : 's'} · ${managedClients} managed`
        : 'No active roster assignment',
      tone: 'comparison',
    },
  ] as const

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.7fr)]">
      <CockpitPanel
        title={comparison ? 'Relationship fields' : 'Relationship field'}
        eyebrow={comparison ? 'Side-by-side object maps' : 'Object map'}
        availability={asAvailability(dossier.availability.network)}
        action={
          <button
            type="button"
            onClick={() => onInspect({ domain: 'NETWORK', title: 'Relationship evidence' })}
            className="rounded p-1 text-[#718096] hover:text-[#ECE8DC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E6BC58]"
            aria-label="Inspect relationship evidence"
          >
            <PanelRightOpen className="h-4 w-4" />
          </button>
        }
        className={cn('min-h-[520px]', comparison && 'xl:col-span-2')}
      >
        <div className={cn('grid gap-4', comparison && '2xl:grid-cols-2')}>
          <div>
            {comparison && (
              <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#E6BC58]">
                {dossier.identity.name}
              </p>
            )}
            <RelationshipMapForDossier
              dossier={dossier}
              onPivot={onPivot}
              height={comparison ? 410 : undefined}
            />
          </div>
          {comparison && (
            <div>
              <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#79B8D8]">
                {comparison.identity.name}
              </p>
              <RelationshipMapForDossier
                dossier={comparison}
                onPivot={onPivot}
                tone="comparison"
                height={410}
              />
            </div>
          )}
        </div>
      </CockpitPanel>

      <div
        className={cn(
          'space-y-4',
          comparison && 'xl:col-span-2 xl:grid xl:grid-cols-2 xl:gap-4 xl:space-y-0'
        )}
      >
        <CockpitPanel title="Current read" eyebrow="Evidence-backed signals">
          <div className="space-y-2.5">
            {attentionSignals.map((signal) => {
              const Icon =
                signal.tone === 'positive'
                  ? ArrowUpRight
                  : signal.tone === 'attention'
                    ? ArrowDownRight
                    : ChevronRight
              return (
                <div
                  key={signal.label}
                  className="rounded-lg border border-[#8197B2]/16 bg-[#0A111B]/80 p-3"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border',
                        signal.tone === 'positive'
                          ? 'border-[#5DC1A7]/25 bg-[#5DC1A7]/10 text-[#5DC1A7]'
                          : signal.tone === 'attention'
                            ? 'border-[#E57B69]/25 bg-[#E57B69]/10 text-[#E57B69]'
                            : signal.tone === 'comparison'
                              ? 'border-[#79B8D8]/25 bg-[#79B8D8]/10 text-[#79B8D8]'
                              : 'border-[#8197B2]/20 bg-[#8197B2]/5 text-[#8D99AA]'
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#718096]">
                        {signal.label}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-[#D9D7CF]">
                        {signal.value}
                      </p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </CockpitPanel>

        <CockpitPanel
          title="Self / external read"
          eyebrow="Perception gap"
          availability={asAvailability(dossier.availability.evaluation)}
          action={
            <button
              type="button"
              onClick={() =>
                onInspect({
                  domain: 'SELF_EVALUATION',
                  title: 'Self-evaluation evidence',
                  lens: 'SELF',
                })
              }
              className="rounded p-1 text-[#718096] hover:text-[#ECE8DC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#79B8D8]"
              aria-label="Inspect self-evaluation evidence"
            >
              <PanelRightOpen className="h-4 w-4" />
            </button>
          }
        >
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="font-mono text-3xl text-[#79B8D8]">
                {selfGap === null ? '—' : formatSigned(selfGap)}
              </p>
              <p className="mt-1 text-[10px] leading-relaxed text-[#8D99AA]">
                Self score minus the weighted external-lens score on the 0–4 scale.
              </p>
            </div>
            {comparison?.evaluation.selfVsOthersGap !== null &&
              comparison?.evaluation.selfVsOthersGap !== undefined && (
                <div className="text-right">
                  <p className="text-[8px] uppercase tracking-[0.12em] text-[#718096]">
                    comparison
                  </p>
                  <p className="mt-1 font-mono text-sm text-[#79B8D8]">
                    {formatSigned(comparison.evaluation.selfVsOthersGap)}
                  </p>
                </div>
              )}
          </div>
        </CockpitPanel>

        <div className="rounded-xl border border-[#E6BC58]/20 bg-[#E6BC58]/5 p-4">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#E6BC58]" />
            <p className="text-[11px] leading-relaxed text-[#B7AA80]">
              Client footprint describes verified roster responsibility and connectivity. Compass
              does not currently contain outcome evidence, so this cockpit makes no client-impact
              claim.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

function EvaluationDomainView({
  dossier,
  comparison,
  onInspect,
}: {
  dossier: EmployeeDossier
  comparison: EmployeeDossier | null
  onInspect: (target: InspectionTarget) => void
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
        <CockpitPanel
          title="Performance trajectory"
          eyebrow="Comparable scored periods"
          availability={asAvailability(dossier.availability.evaluation)}
        >
          <EvaluationTrajectory
            primaryName={dossier.identity.name}
            primary={evaluationHistory(dossier)}
            comparisonName={comparison?.identity.name}
            comparison={comparison ? evaluationHistory(comparison) : []}
          />
        </CockpitPanel>

        <CockpitPanel
          title="Lens matrix"
          eyebrow="0–4 relationship scale"
          availability={asAvailability(dossier.availability.evaluation)}
          action={
            <button
              type="button"
              onClick={() =>
                onInspect({ domain: 'EVALUATION', title: 'Relationship-lens evidence' })
              }
              className="rounded p-1 text-[#718096] hover:text-[#ECE8DC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E6BC58]"
              aria-label="Inspect relationship lens evidence"
            >
              <PanelRightOpen className="h-4 w-4" />
            </button>
          }
        >
          <LensMatrix
            primaryName={dossier.identity.name}
            primary={lensReadouts(dossier)}
            comparisonName={comparison?.identity.name}
            comparison={comparison ? lensReadouts(comparison) : []}
          />
        </CockpitPanel>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <CockpitPanel title="Evaluator context" eyebrow="Lens-first, calibrated">
          {dossier.evaluation.raters.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left">
                <thead>
                  <tr className="border-b border-[#8197B2]/15 text-[9px] uppercase tracking-[0.14em] text-[#66758A]">
                    <th className="pb-2 font-medium">Source</th>
                    <th className="pb-2 font-medium">Lens</th>
                    <th className="pb-2 text-right font-medium">Mean given</th>
                    <th className="pb-2 text-right font-medium">Vs norm</th>
                    <th className="pb-2 text-right font-medium">Responses</th>
                  </tr>
                </thead>
                <tbody>
                  {dossier.evaluation.raters.map((rater) => (
                    <tr
                      key={rater.raterKey}
                      className="border-b border-[#8197B2]/10 text-xs last:border-0"
                    >
                      <td className="py-3 font-mono text-[#8D99AA]">
                        {rater.raterKey.slice(0, 10)}
                        {rater.isProvisional && (
                          <span className="ml-2 text-[8px] uppercase text-[#E6BC58]">
                            provisional
                          </span>
                        )}
                      </td>
                      <td className="py-3 text-[#B5BDCA]">
                        {LENS_LABELS[rater.relationshipType] ?? rater.relationshipType}
                      </td>
                      <td className="py-3 text-right font-mono text-[#ECE8DC]">
                        {rater.meanGiven === null ? '—' : rater.meanGiven.toFixed(2)}
                      </td>
                      <td
                        className={cn(
                          'py-3 text-right font-mono',
                          rater.deviation === null
                            ? 'text-[#718096]'
                            : rater.deviation < 0
                              ? 'text-[#E57B69]'
                              : 'text-[#5DC1A7]'
                        )}
                      >
                        {rater.deviation === null ? '—' : formatSigned(rater.deviation)}
                      </td>
                      <td className="py-3 text-right font-mono text-[#8D99AA]">
                        {rater.responseCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-[#8197B2]/20 p-8 text-center text-sm text-[#8D99AA]">
              No submitted evaluator evidence is available for this period.
            </p>
          )}
        </CockpitPanel>

        <CockpitPanel title="Decision context" eyebrow="Descriptive, not predictive">
          <div className="space-y-4">
            <div>
              <p className="text-[9px] uppercase tracking-[0.14em] text-[#718096]">
                Performance band
              </p>
              <p className="mt-1 text-xl font-semibold text-[#ECE8DC]">
                {dossier.evaluation.performanceBand ?? 'Not classified'}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 border-t border-[#8197B2]/15 pt-4">
              <div>
                <p className="text-[9px] uppercase tracking-[0.14em] text-[#718096]">
                  Org baseline
                </p>
                <p className="mt-1 font-mono text-lg text-[#D9D7CF]">
                  {formatPercent(dossier.evaluation.companyBaseline)}
                </p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-[0.14em] text-[#718096]">
                  Self gap
                </p>
                <p className="mt-1 font-mono text-lg text-[#79B8D8]">
                  {formatSigned(dossier.evaluation.selfVsOthersGap)}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                onInspect({ domain: 'EVALUATION', title: 'Question-level evaluation evidence' })
              }
              className="flex w-full items-center justify-between rounded-lg border border-[#E6BC58]/25 bg-[#E6BC58]/5 px-3 py-2.5 text-left text-xs text-[#D8C98F] transition-colors hover:bg-[#E6BC58]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E6BC58]"
            >
              Open question-level evidence
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </CockpitPanel>
      </div>
    </div>
  )
}

function ClientAssignmentCards({ dossier }: { dossier: EmployeeDossier }) {
  if (!dossier.clientFootprint.assignments.length) {
    return (
      <p className="rounded-lg border border-dashed border-[#8197B2]/20 p-8 text-center text-sm text-[#8D99AA]">
        No active client roster assignment.
      </p>
    )
  }

  return (
    <div className="space-y-2.5">
      {dossier.clientFootprint.assignments.map((assignment) => (
        <div
          key={assignment.clientId}
          className="rounded-lg border border-[#8197B2]/16 bg-[#0A111B] p-3"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-xs font-medium text-[#D9D7CF]">
              {assignment.clientName}
            </p>
            <span className="rounded-full border border-[#79B8D8]/25 bg-[#79B8D8]/10 px-2 py-0.5 text-[8px] uppercase tracking-[0.12em] text-[#79B8D8]">
              {assignment.role}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[9px] uppercase tracking-[0.1em] text-[#66758A]">
            <span>{assignment.tenureDays} recorded days</span>
            <span className="text-right">{assignment.teamSize ?? '—'} team members</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function ClientFootprintTelemetry({
  dossier,
  tone = 'primary',
}: {
  dossier: EmployeeDossier
  tone?: 'primary' | 'comparison'
}) {
  const hasData = dossier.availability.clients !== 'NO_DATA'
  const concentration = dossier.clientFootprint.concentration
  const metrics = [
    {
      label: 'Active assignments',
      value: hasData ? String(dossier.clientFootprint.assignments.length) : '—',
      detail: 'Current client roster records',
    },
    {
      label: 'Manager roles',
      value: hasData
        ? String(
            dossier.clientFootprint.assignments.filter(
              (assignment) => assignment.role === 'MANAGER'
            ).length
          )
        : '—',
      detail: 'Recorded responsibility, not outcome',
    },
    {
      label: 'Largest share',
      value: concentration
        ? `${Math.round(concentration.share * 100)}%`
        : '—',
      detail: concentration
        ? concentration.primaryClientName
          ? `${concentration.primaryClientName} · assignment count`
          : 'Tied largest share · assignment count'
        : 'No concentration basis',
    },
    {
      label: 'Shared-client links',
      value: hasData
        ? String(dossier.clientFootprint.collaborators.length)
        : '—',
      detail: 'Distinct connected colleagues',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="rounded-lg border border-[#8197B2]/16 bg-[#0A111B] p-3"
        >
          <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-[#718096]">
            {metric.label}
          </p>
          <p
            className={cn(
              'mt-2 font-mono text-xl',
              tone === 'comparison' ? 'text-[#79B8D8]' : 'text-[#E6BC58]'
            )}
          >
            {metric.value}
          </p>
          <p className="mt-1 text-[9px] leading-relaxed text-[#66758A]">
            {metric.detail}
          </p>
        </div>
      ))}
    </div>
  )
}

function ClientsDomainView({
  dossier,
  comparison,
  onPivot,
  onInspect,
}: {
  dossier: EmployeeDossier
  comparison: EmployeeDossier | null
  onPivot: (employeeId: string) => void
  onInspect: (target: InspectionTarget) => void
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#E6BC58]/20 bg-[#E6BC58]/5 px-4 py-3">
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#E6BC58]" />
          <p className="text-[11px] leading-relaxed text-[#B7AA80]">
            This domain measures current roster coverage, role, recorded tenure, and shared-client
            connectivity. It does not measure revenue, satisfaction, renewal, or delivery outcomes.
          </p>
        </div>
      </div>

      <div className={cn('grid gap-4', comparison && 'xl:grid-cols-2')}>
        <CockpitPanel
          title={comparison ? dossier.identity.name : 'Footprint telemetry'}
          eyebrow="Assignment-count evidence"
          availability={asAvailability(dossier.availability.clients)}
        >
          <ClientFootprintTelemetry dossier={dossier} />
        </CockpitPanel>
        {comparison && (
          <CockpitPanel
            title={comparison.identity.name}
            eyebrow="Comparison footprint"
            availability={asAvailability(comparison.availability.clients)}
          >
            <ClientFootprintTelemetry dossier={comparison} tone="comparison" />
          </CockpitPanel>
        )}
      </div>

      <div
        className={cn(
          'grid gap-4',
          comparison
            ? 'xl:grid-cols-2'
            : 'xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]'
        )}
      >
        <CockpitPanel
          title={comparison ? dossier.identity.name : 'Client and collaborator field'}
          eyebrow="Verified active relationships"
          availability={asAvailability(dossier.availability.clients)}
          className="min-h-[500px]"
        >
          <RelationshipMapForDossier dossier={dossier} onPivot={onPivot} />
        </CockpitPanel>

        {comparison ? (
          <CockpitPanel
            title={comparison.identity.name}
            eyebrow="Comparison relationships"
            availability={asAvailability(comparison.availability.clients)}
            className="min-h-[500px]"
          >
            <EmployeeRelationshipMap
              employee={{
                id: comparison.identity.id,
                name: comparison.identity.name,
                position: comparison.identity.position,
                department: comparison.identity.department,
              }}
              clients={comparison.clientFootprint.assignments.map((assignment) => ({
                id: assignment.clientId,
                name: assignment.clientName,
                role: assignment.role,
              }))}
              network={{
                leads: comparison.network.edges
                  .filter((edge) => edge.kind === 'LEAD' && edge.person.employeeId)
                  .map((edge) => ({
                    id: edge.person.employeeId,
                    name: edge.person.name,
                    position: edge.person.position,
                  })),
                reports: comparison.network.edges
                  .filter((edge) => edge.kind === 'REPORT' && edge.person.employeeId)
                  .map((edge) => ({
                    id: edge.person.employeeId,
                    name: edge.person.name,
                    position: edge.person.position,
                  })),
                colleagues: comparison.network.edges
                  .filter((edge) => edge.kind === 'SHARED_CLIENT' && edge.person.employeeId)
                  .map((edge) => ({
                    id: edge.person.employeeId,
                    name: edge.person.name,
                    position: edge.person.position,
                    clients: edge.sharedClientNames,
                  })),
              }}
              evaluators={comparison.network.edges
                .filter((edge) => edge.kind === 'EVALUATOR')
                .map((edge) => ({
                  id: edge.person.employeeId,
                  name: edge.person.name,
                  relationshipType: edge.label,
                }))}
              onPivotEmployee={onPivot}
              tone="comparison"
            />
          </CockpitPanel>
        ) : (
          <CockpitPanel
            title="Active footprint"
            eyebrow="Current assignments"
            availability={asAvailability(dossier.availability.clients)}
            action={
              <button
                type="button"
                onClick={() =>
                  onInspect({ domain: 'CLIENTS', title: 'Client footprint evidence' })
                }
                className="rounded p-1 text-[#718096] hover:text-[#ECE8DC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E6BC58]"
                aria-label="Inspect client footprint evidence"
              >
                <PanelRightOpen className="h-4 w-4" />
              </button>
            }
          >
            <ClientAssignmentCards dossier={dossier} />
          </CockpitPanel>
        )}
      </div>

      {comparison && (
        <div className="grid gap-4 xl:grid-cols-2">
          <CockpitPanel
            title={`${dossier.identity.name} · active footprint`}
            eyebrow="Current assignments"
            availability={asAvailability(dossier.availability.clients)}
            action={
              <button
                type="button"
                onClick={() =>
                  onInspect({ domain: 'CLIENTS', title: 'Client footprint evidence' })
                }
                className="rounded p-1 text-[#718096] hover:text-[#ECE8DC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E6BC58]"
                aria-label="Inspect client footprint evidence"
              >
                <PanelRightOpen className="h-4 w-4" />
              </button>
            }
          >
            <ClientAssignmentCards dossier={dossier} />
          </CockpitPanel>
          <CockpitPanel
            title={`${comparison.identity.name} · active footprint`}
            eyebrow="Comparison assignments"
            availability={asAvailability(comparison.availability.clients)}
          >
            <ClientAssignmentCards dossier={comparison} />
          </CockpitPanel>
        </div>
      )}

      <CockpitPanel title="Shared-client collaborators" eyebrow="Relationship centrality">
        {dossier.clientFootprint.collaborators.length ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {dossier.clientFootprint.collaborators.map((person) => (
              <button
                key={person.employeeId}
                type="button"
                onClick={() => onPivot(person.employeeId)}
                className="rounded-lg border border-[#8197B2]/16 bg-[#0A111B] p-3 text-left transition-colors hover:border-[#79B8D8]/30 hover:bg-[#111C2A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#79B8D8]"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-xs font-medium text-[#D9D7CF]">{person.name}</p>
                  <span className="font-mono text-xs text-[#79B8D8]">
                    ×{person.sharedClients.length}
                  </span>
                </div>
                <p className="mt-1 truncate text-[9px] text-[#718096]">
                  {person.sharedClients.map((client) => client.name).join(', ')}
                </p>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[#8D99AA]">No shared-client collaborators recorded.</p>
        )}
      </CockpitPanel>
    </div>
  )
}

function CompensationDomainView({
  dossier,
  comparison,
  onInspect,
}: {
  dossier: EmployeeDossier
  comparison: EmployeeDossier | null
  onInspect: (target: InspectionTarget) => void
}) {
  const operationsAvailable = dossier.availability.operations !== 'NO_DATA'
  const comparisonOperationsAvailable =
    comparison !== null && comparison.availability.operations !== 'NO_DATA'
  const evaluationMarkers = [
    ...new Map(
      [
        ...dossier.evaluation.history,
        ...(comparison?.evaluation.history ?? []),
      ].map((point) => [
        point.period.id,
        {
          date: point.period.endDate,
          label: point.period.name,
        },
      ])
    ).values(),
  ]
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
        <CockpitPanel
          title="Basic salary trajectory"
          eyebrow="Finalized payroll observations"
          availability={asAvailability(dossier.availability.compensation)}
          action={
            <button
              type="button"
              onClick={() =>
                onInspect({ domain: 'COMPENSATION', title: 'Compensation evidence' })
              }
              className="rounded p-1 text-[#718096] hover:text-[#ECE8DC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E6BC58]"
              aria-label="Inspect compensation evidence"
            >
              <PanelRightOpen className="h-4 w-4" />
            </button>
          }
        >
          <CompensationTrajectory
            primaryName={dossier.identity.name}
            primary={compensationHistory(dossier)}
            comparisonName={comparison?.identity.name}
            comparison={comparison ? compensationHistory(comparison) : []}
            evaluationMarkers={evaluationMarkers}
          />
          {dossier.compensation.currencies.length > 1 && (
            <p className="mt-3 rounded-lg border border-[#E57B69]/20 bg-[#E57B69]/5 p-3 text-[10px] leading-relaxed text-[#D49388]">
              Multiple currencies are present. Compass keeps their histories separate and does not
              calculate cross-currency growth.
            </p>
          )}
        </CockpitPanel>

        <CockpitPanel
          title="Capacity context"
          eyebrow={`As of ${formatDate(dossier.operations.asOf)}`}
          availability={asAvailability(dossier.availability.operations)}
          action={
            <button
              type="button"
              onClick={() => onInspect({ domain: 'OPERATIONS', title: 'Capacity evidence' })}
              className="rounded p-1 text-[#718096] hover:text-[#ECE8DC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E6BC58]"
              aria-label="Inspect capacity evidence"
            >
              <PanelRightOpen className="h-4 w-4" />
            </button>
          }
        >
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                label: 'Open tasks',
                value: dossier.operations.openTasks,
                comparison: comparison?.operations.openTasks,
              },
              {
                label: 'Overdue',
                value: dossier.operations.overdueTasks,
                comparison: comparison?.operations.overdueTasks,
              },
              {
                label: 'Recent completions',
                value: dossier.operations.recentCompletions,
                comparison: comparison?.operations.recentCompletions,
              },
              {
                label: 'Working leave days',
                value: dossier.operations.approvedWorkingLeaveDays,
                comparison: comparison?.operations.approvedWorkingLeaveDays,
              },
            ].map((metric) => (
              <div
                key={metric.label}
                className="rounded-lg border border-[#8197B2]/16 bg-[#0A111B] p-3"
              >
                <p className="text-[9px] uppercase tracking-[0.13em] text-[#718096]">
                  {metric.label}
                </p>
                <p
                  className={cn(
                    'mt-2 font-mono text-2xl',
                    metric.label === 'Overdue' && Number(metric.value) > 0
                      ? 'text-[#E57B69]'
                      : 'text-[#ECE8DC]'
                  )}
                >
                  {operationsAvailable ? metric.value : '—'}
                </p>
                {comparison && (
                  <p className="mt-1 font-mono text-[10px] text-[#79B8D8]">
                    {comparison.identity.name.split(' ')[0]} ·{' '}
                    {comparisonOperationsAvailable ? metric.comparison : '—'}
                  </p>
                )}
              </div>
            ))}
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-[#718096]">
            Capacity context is never included in evaluation or talent classification.
          </p>
        </CockpitPanel>
      </div>

      <CockpitPanel title="Verified change events" eyebrow="Observed basic salary">
        {dossier.compensation.changeEvents.length ? (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {dossier.compensation.changeEvents.map((event) => (
              <div
                key={`${event.currency}-${event.effectiveFrom}`}
                className="rounded-lg border border-[#8197B2]/16 bg-[#0A111B] p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[9px] uppercase tracking-[0.12em] text-[#718096]">
                    {formatDate(event.effectiveFrom)}
                  </p>
                  <span
                    className={cn(
                      'font-mono text-xs',
                      event.delta >= 0 ? 'text-[#5DC1A7]' : 'text-[#E57B69]'
                    )}
                  >
                    {event.percentChange === null
                      ? formatMoney(event.delta, event.currency)
                      : formatSigned(event.percentChange, '%')}
                  </span>
                </div>
                <p className="mt-2 font-mono text-xs text-[#D9D7CF]">
                  {formatMoney(event.previousAmount, event.currency)} →{' '}
                  {formatMoney(event.amount, event.currency)}
                </p>
                <p className="mt-2 text-[9px] text-[#66758A]">
                  {event.periodName ?? 'Payroll period unavailable'}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-[#8197B2]/20 p-8 text-center text-sm text-[#8D99AA]">
            No verified salary change event is available.
          </p>
        )}
      </CockpitPanel>
    </div>
  )
}

function TimelineDomainView({
  dossier,
  comparison,
}: {
  dossier: EmployeeDossier
  comparison: EmployeeDossier | null
}) {
  return (
    <div className={cn('grid gap-4', comparison && 'xl:grid-cols-2')}>
      <CockpitPanel title={dossier.identity.name} eyebrow="Unified source timeline">
        <CockpitTimeline events={timelineEvents(dossier)} />
      </CockpitPanel>
      {comparison && (
        <CockpitPanel title={comparison.identity.name} eyebrow="Comparison timeline">
          <CockpitTimeline events={timelineEvents(comparison)} />
        </CockpitPanel>
      )}
    </div>
  )
}

export function Employee360Cockpit() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [directory, setDirectory] = useState<DirectoryPayload | null>(null)
  const [directoryError, setDirectoryError] = useState<string | null>(null)
  const [directoryLoading, setDirectoryLoading] = useState(true)
  const [directoryRetry, setDirectoryRetry] = useState(0)

  const [profile, setProfile] = useState<ProfilePayload | null>(null)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileRetry, setProfileRetry] = useState(0)

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'ACTIVE' | 'ARCHIVED'>('ACTIVE')
  const [mobileDirectoryOpen, setMobileDirectoryOpen] = useState(false)

  const [inspection, setInspection] = useState<InspectionTarget | null>(null)
  const [evidence, setEvidence] = useState<EvidencePayload | null>(null)
  const [evidenceLoading, setEvidenceLoading] = useState(false)
  const [evidenceError, setEvidenceError] = useState<string | null>(null)
  const [evidenceRetry, setEvidenceRetry] = useState(0)
  const [revealEvaluator, setRevealEvaluator] = useState(false)

  const profileCache = useRef(visitedProfileCache)

  const urlState = parseEmployee360UrlState(searchParams)
  const selectedId = urlState.employeeId
  const periodId = urlState.periodId
  const compareId = urlState.compareId
  const requestedCompareId = searchParams.get('compareId')
  const domain = urlState.domain

  const updateUrl = useCallback(
    (
      changes: Partial<Record<keyof Employee360UrlState, string | null>>,
      navigation: 'push' | 'replace' = 'push'
    ) => {
      const next = updateEmployee360SearchParams(searchParams, changes)
      const href = `${pathname}?${next.toString()}`
      if (navigation === 'replace') router.replace(href, { scroll: false })
      else router.push(href, { scroll: false })
    },
    [pathname, router, searchParams]
  )

  useEffect(() => {
    const controller = new AbortController()
    setDirectoryLoading(true)
    setDirectoryError(null)

    fetch('/api/admin/analytics/employee-360/directory', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Failed to load employee directory')
        const parsed = directoryPayloadSchema.safeParse(payload)
        if (!parsed.success) throw new Error('Employee directory returned an invalid contract')
        return parsed.data
      })
      .then((payload) => setDirectory(payload))
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setDirectoryError(error instanceof Error ? error.message : 'Failed to load employee directory')
      })
      .finally(() => {
        if (!controller.signal.aborted) setDirectoryLoading(false)
      })

    return () => controller.abort()
  }, [directoryRetry])

  useEffect(() => {
    if (!directory || !directory.employees.length) return
    const selected = directory.employees.find((employee) => employee.id === selectedId)
    const comparison = directory.employees.find(
      (employee) => employee.id === compareId
    )
    const defaultEmployee =
      directory.employees.find((employee) => employee.employmentStatus === 'ACTIVE') ??
      directory.employees[0]
    const defaultPeriod =
      directory.periods.find((period) => period.isActive) ?? directory.periods[0] ?? null
    const selectedPeriod = directory.periods.find((period) => period.id === periodId)

    const changes: Record<string, string | null> = {}
    if (!selected) changes.employeeId = defaultEmployee.id
    if (!selectedPeriod && defaultPeriod) changes.periodId = defaultPeriod.id
    if (compareId && !comparison) changes.compareId = null
    if (Object.keys(changes).length) updateUrl(changes, 'replace')

    if (selected?.employmentStatus === 'ARCHIVED') setStatus('ARCHIVED')
  }, [compareId, directory, periodId, selectedId, updateUrl])

  useEffect(() => {
    if (!selectedId) return
    if (requestedCompareId === selectedId) {
      updateUrl({ compareId: null }, 'replace')
      return
    }

    const key = profileCacheKey(selectedId, periodId, compareId)
    const cached = profileCache.current.get(key)
    if (cached) {
      setProfile(cached)
      setProfileError(null)
      setProfileLoading(false)
      return
    }

    const controller = new AbortController()
    setProfileLoading(true)
    setProfile(null)
    setProfileError(null)

    const params = new URLSearchParams({ employeeId: selectedId })
    if (periodId) params.set('periodId', periodId)
    if (compareId) params.set('compareId', compareId)

    fetch(`/api/admin/analytics/employee-360?${params.toString()}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Failed to assemble employee profile')
        const parsed = profilePayloadSchema.safeParse(payload)
        if (!parsed.success) {
          console.error(parsed.error.flatten())
          throw new Error('Employee profile returned an invalid contract')
        }
        return parsed.data
      })
      .then((payload) => {
        profileCache.current.set(key, payload)
        if (profileCache.current.size > FINALIZED_PROFILE_CACHE_LIMIT) {
          const first = profileCache.current.keys().next().value
          if (first) profileCache.current.delete(first)
        }
        setProfile(payload)
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setProfileError(error instanceof Error ? error.message : 'Failed to assemble employee profile')
      })
      .finally(() => {
        if (!controller.signal.aborted) setProfileLoading(false)
      })

    return () => controller.abort()
  }, [
    compareId,
    periodId,
    profileRetry,
    requestedCompareId,
    selectedId,
    updateUrl,
  ])

  const remoteEvidence =
    inspection?.domain === 'EVALUATION' || inspection?.domain === 'SELF_EVALUATION'

  useEffect(() => {
    if (!inspection || !remoteEvidence || !selectedId || !profile?.selectedPeriod?.id) {
      setEvidence(null)
      setEvidenceError(null)
      setEvidenceLoading(false)
      return
    }

    const controller = new AbortController()
    setEvidenceLoading(true)
    setEvidence(null)
    setEvidenceError(null)

    const params = new URLSearchParams({
      employeeId: selectedId,
      periodId: profile.selectedPeriod.id,
      domain: inspection.domain,
      revealEvaluator: String(revealEvaluator),
    })
    if (inspection.lens) params.set('lens', inspection.lens)

    fetch(`/api/admin/analytics/employee-360/evidence?${params.toString()}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Failed to load source evidence')
        const parsed = evidencePayloadSchema.safeParse(payload)
        if (!parsed.success) throw new Error('Evidence returned an invalid contract')
        return parsed.data
      })
      .then(setEvidence)
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setEvidenceError(error instanceof Error ? error.message : 'Failed to load source evidence')
      })
      .finally(() => {
        if (!controller.signal.aborted) setEvidenceLoading(false)
      })

    return () => controller.abort()
  }, [
    evidenceRetry,
    inspection,
    profile?.selectedPeriod?.id,
    remoteEvidence,
    revealEvaluator,
    selectedId,
  ])

  const visiblePeople = useMemo(() => {
    if (!directory) return []
    const term = query.trim().toLowerCase()
    return directory.employees
      .filter((employee) => employee.employmentStatus === status)
      .filter((employee) => {
        if (!term) return true
        return [employee.name, employee.department, employee.position]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(term))
      })
      .map(makeDirectoryPerson)
  }, [directory, query, status])

  const handleSelect = useCallback(
    (employeeId: string) => {
      setMobileDirectoryOpen(false)
      setInspection(null)
      setRevealEvaluator(false)
      updateUrl({ employeeId, compareId: employeeId === compareId ? null : compareId })
    },
    [compareId, updateUrl]
  )

  const handlePivot = useCallback(
    (employeeId: string) => {
      setInspection(null)
      setRevealEvaluator(false)
      updateUrl({ employeeId, compareId: null })
    },
    [updateUrl]
  )

  const handleCompare = useCallback(
    (employeeId: string | null) => {
      if (employeeId && employeeId === selectedId) return
      updateUrl({ compareId: employeeId })
    },
    [selectedId, updateUrl]
  )

  const openInspection = useCallback((target: InspectionTarget) => {
    setRevealEvaluator(false)
    setInspection(target)
  }, [])

  if (directoryLoading && !directory) {
    return (
      <div className={cn('h-full min-h-0', styles.cockpit)}>
        <LoadingCockpit />
      </div>
    )
  }

  if (directoryError || !directory) {
    return (
      <div className={cn('h-full min-h-0', styles.cockpit)}>
        <ErrorState
          title="The subject index is unavailable"
          detail={directoryError || 'Compass could not assemble the employee directory.'}
          onRetry={() => setDirectoryRetry((value) => value + 1)}
        />
      </div>
    )
  }

  const selectedDirectoryPerson = directory.employees.find(
    (employee) => employee.id === selectedId
  )

  return (
    <div className={cn('h-full min-h-0 overflow-hidden', styles.cockpit)}>
      <div className="grid h-full min-h-0 lg:grid-cols-[270px_minmax(0,1fr)]">
        <SubjectRail
          people={visiblePeople}
          selectedId={selectedId}
          compareId={compareId}
          query={query}
          status={status}
          onQueryChange={setQuery}
          onStatusChange={setStatus}
          onSelect={handleSelect}
          onCompare={handleCompare}
          className="hidden lg:flex"
        />

        <div className="flex min-h-0 min-w-0 flex-col">
          <header className="z-20 flex min-h-14 shrink-0 items-center justify-between gap-3 border-b border-[#8197B2]/20 bg-[#070B12]/90 px-3 backdrop-blur-xl sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileDirectoryOpen(true)}
                className="rounded-md border border-[#8197B2]/20 p-2 text-[#8D99AA] hover:text-[#ECE8DC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E6BC58] lg:hidden"
                aria-label="Open employee directory"
              >
                <Menu className="h-4 w-4" />
              </button>
              <div className="flex min-w-0 items-center gap-2">
                <Radio className="h-3.5 w-3.5 shrink-0 text-[#E6BC58]" />
                <div className="min-w-0">
                  <p className="truncate text-[9px] font-semibold uppercase tracking-[0.2em] text-[#8D99AA]">
                    Intelligence / Employee 360
                  </p>
                  <p className="truncate text-[9px] text-[#586679]">
                    {selectedDirectoryPerson?.name ?? 'Select a subject'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Select
                value={periodId ?? directory.periods[0]?.id}
                onValueChange={(value) => updateUrl({ periodId: value })}
                disabled={!directory.periods.length}
              >
                <SelectTrigger
                  aria-label="Evaluation period"
                  className="h-8 w-[132px] border-[#8197B2]/25 bg-[#0A111B] text-[10px] text-[#D9D7CF] focus:ring-[#E6BC58]/60 sm:w-[176px]"
                >
                  <SelectValue placeholder="No scored periods" />
                </SelectTrigger>
                <SelectContent className="border-[#8197B2]/25 bg-[#0D1521] text-[#D9D7CF]">
                  {directory.periods.map((period) => (
                    <SelectItem
                      key={period.id}
                      value={period.id}
                      className="text-xs focus:bg-[#182233] focus:text-[#ECE8DC]"
                    >
                      {period.name}
                      {period.isActive ? ' · active' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                type="button"
                onClick={() =>
                  openInspection({ domain: 'NETWORK', title: 'Dossier source coverage' })
                }
                className="rounded-md border border-[#8197B2]/20 p-2 text-[#8D99AA] hover:text-[#ECE8DC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E6BC58]"
                aria-label="Open evidence layer"
              >
                <PanelRightOpen className="h-3.5 w-3.5" />
              </button>
            </div>
          </header>

          <main className={cn('min-h-0 flex-1 overflow-y-auto', styles.rail)}>
            {profileLoading && !profile ? (
              <LoadingCockpit />
            ) : profileError || !profile ? (
              <ErrorState
                title="This dossier could not be assembled"
                detail={profileError || 'Choose an employee with available source records.'}
                onRetry={() => setProfileRetry((value) => value + 1)}
              />
            ) : (
              <div className="p-3 sm:p-4 xl:p-5">
                <ProfileHeader
                  dossier={profile.primary}
                  comparison={profile.comparison ?? null}
                  generatedAt={profile.generatedAt}
                  onClearComparison={() => handleCompare(null)}
                />
                <SignalStripView
                  dossier={profile.primary}
                  comparison={profile.comparison ?? null}
                  onInspect={openInspection}
                />

                <Tabs
                  value={domain}
                  onValueChange={(value) =>
                    updateUrl({ domain: value })
                  }
                >
                  <div className="mb-4 overflow-x-auto">
                    <TabsList className="h-10 min-w-max justify-start rounded-lg border border-[#8197B2]/20 bg-[#090F18] p-1">
                      {DOMAINS.map((item) => {
                        const Icon =
                          item === 'overview'
                            ? Target
                            : item === 'evaluation'
                              ? TrendingUp
                              : item === 'clients'
                                ? Network
                                : item === 'compensation'
                                  ? CircleDollarSign
                                  : History
                        return (
                          <TabsTrigger
                            key={item}
                            value={item}
                            className="gap-1.5 px-3 text-[10px] text-[#718096] data-[state=active]:bg-[#182233] data-[state=active]:text-[#ECE8DC] data-[state=active]:shadow-none"
                          >
                            <Icon className="h-3.5 w-3.5" />
                            {DOMAIN_LABELS[item]}
                          </TabsTrigger>
                        )
                      })}
                    </TabsList>
                  </div>

                  <TabsContent value="overview" className="mt-0">
                    <OverviewDomain
                      dossier={profile.primary}
                      comparison={profile.comparison ?? null}
                      onPivot={handlePivot}
                      onInspect={openInspection}
                    />
                  </TabsContent>
                  <TabsContent value="evaluation" className="mt-0">
                    <EvaluationDomainView
                      dossier={profile.primary}
                      comparison={profile.comparison ?? null}
                      onInspect={openInspection}
                    />
                  </TabsContent>
                  <TabsContent value="clients" className="mt-0">
                    <ClientsDomainView
                      dossier={profile.primary}
                      comparison={profile.comparison ?? null}
                      onPivot={handlePivot}
                      onInspect={openInspection}
                    />
                  </TabsContent>
                  <TabsContent value="compensation" className="mt-0">
                    <CompensationDomainView
                      dossier={profile.primary}
                      comparison={profile.comparison ?? null}
                      onInspect={openInspection}
                    />
                  </TabsContent>
                  <TabsContent value="timeline" className="mt-0">
                    <TimelineDomainView
                      dossier={profile.primary}
                      comparison={profile.comparison ?? null}
                    />
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </main>
        </div>
      </div>

      <Sheet open={mobileDirectoryOpen} onOpenChange={setMobileDirectoryOpen}>
        <SheetContent
          side="left"
          className="w-[88vw] max-w-sm border-[#8197B2]/25 bg-[#090F18] p-0 text-[#ECE8DC] [&>button]:z-20 [&>button]:text-[#8D99AA]"
        >
          <SheetTitle className="sr-only">Employee directory</SheetTitle>
          <SheetDescription className="sr-only">
            Search active or archived employees and choose a dossier.
          </SheetDescription>
          <SubjectRail
            people={visiblePeople}
            selectedId={selectedId}
            compareId={compareId}
            query={query}
            status={status}
            onQueryChange={setQuery}
            onStatusChange={setStatus}
            onSelect={handleSelect}
            onCompare={handleCompare}
          />
        </SheetContent>
      </Sheet>

      <EvidenceDrawer
        open={Boolean(inspection)}
        onOpenChange={(open) => {
          if (!open) {
            setInspection(null)
            setRevealEvaluator(false)
          }
        }}
        inspection={inspection}
        dossier={profile?.primary ?? null}
        evidence={evidence}
        loading={evidenceLoading}
        error={evidenceError}
        revealEvaluator={revealEvaluator}
        onRevealEvaluator={setRevealEvaluator}
        onRetry={() => setEvidenceRetry((value) => value + 1)}
      />
    </div>
  )
}
