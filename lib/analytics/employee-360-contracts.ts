import { z } from 'zod'

/**
 * Runtime contracts shared by the Employee 360 API and cockpit.
 *
 * Sensitive fields are intentionally absent. In particular, these contracts
 * have no place for bank details, government identifiers, or payroll receipts.
 */

export const availabilitySchema = z.enum(['AVAILABLE', 'PARTIAL', 'NO_DATA'])
export type Availability = z.infer<typeof availabilitySchema>

export const employmentStatusSchema = z.enum(['ACTIVE', 'ARCHIVED'])
export type EmploymentStatus = z.infer<typeof employmentStatusSchema>

export const relationshipTypeSchema = z.enum([
  'TEAM_LEAD',
  'PEER',
  'HR',
  'DEPT',
  'DIRECT_REPORT',
  'C_LEVEL',
  'CROSS_DEPARTMENT',
  'SELF',
])

export const periodRefSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  isActive: z.boolean(),
})
export type Employee360PeriodRef = z.infer<typeof periodRefSchema>

export const domainAvailabilitySchema = z.object({
  evaluation: availabilitySchema,
  clients: availabilitySchema,
  compensation: availabilitySchema,
  operations: availabilitySchema,
  network: availabilitySchema,
})
export type DomainAvailability = z.infer<typeof domainAvailabilitySchema>

export const identitySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  department: z.string().nullable(),
  position: z.string().nullable(),
  teamTag: z.string().nullable(),
})
export type Employee360Identity = z.infer<typeof identitySchema>

export const directoryEmployeeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  department: z.string().nullable(),
  position: z.string().nullable(),
  employmentStatus: employmentStatusSchema,
  dataCoverage: domainAvailabilitySchema,
})
export type DirectoryEmployee = z.infer<typeof directoryEmployeeSchema>

export const directoryPayloadSchema = z.object({
  generatedAt: z.string().datetime(),
  periods: z.array(periodRefSchema).default([]),
  employees: z.array(directoryEmployeeSchema).default([]),
})
export type DirectoryPayload = z.infer<typeof directoryPayloadSchema>

const moneySchema = z.object({
  amount: z.number().finite().positive(),
  currency: z.string().trim().min(1),
})

const workloadSignalSchema = z.object({
  openTasks: z.number().int().nonnegative(),
  overdueTasks: z.number().int().nonnegative(),
  recentCompletions: z.number().int().nonnegative(),
})

export const signalStripSchema = z.object({
  performance: z.number().finite().min(0).max(100).nullable(),
  momentum: z.number().finite().nullable(),
  evaluatorConsensus: z.number().finite().min(0).max(1).nullable(),
  clientFootprint: z.number().int().nonnegative().nullable(),
  currentCompensation: moneySchema.nullable(),
  compensationChange: z.number().finite().nullable(),
  workload: workloadSignalSchema.nullable(),
  dataCompleteness: z.number().finite().min(0).max(1),
})
export type SignalStrip = z.infer<typeof signalStripSchema>

export const evaluationLensSchema = z
  .object({
    relationshipType: relationshipTypeSchema,
    score: z.number().finite().min(0).max(4).nullable(),
    evaluatorCount: z.number().int().nonnegative(),
    orgAverage: z.number().finite().min(0).max(4).nullable(),
    weight: z.number().finite().min(0).max(1).nullable(),
    includedInOverall: z.boolean(),
  })
  .superRefine((value, context) => {
    if (
      value.relationshipType === 'SELF' &&
      (value.includedInOverall || (value.weight !== null && value.weight !== 0))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'SELF is evidence only and cannot contribute to the weighted overall',
        path: ['includedInOverall'],
      })
    }
    if (
      value.relationshipType !== 'SELF' &&
      value.includedInOverall &&
      (value.weight === null || value.weight <= 0)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A lens included in the overall must have a positive weight',
        path: ['weight'],
      })
    }
  })
export type EvaluationLens = z.infer<typeof evaluationLensSchema>

export const evaluationHistoryPointSchema = z.object({
  period: periodRefSchema,
  overallScore: z.number().finite().min(0).max(100).nullable(),
  perLens: z.array(evaluationLensSchema).default([]),
})
export type EvaluationHistoryPoint = z.infer<typeof evaluationHistoryPointSchema>

export const calibratedRaterSchema = z.object({
  /**
   * Opaque row key. It is not an employee id and cannot be used to identify the
   * evaluator without an explicit evidence reveal request.
   */
  raterKey: z.string().min(1),
  relationshipType: relationshipTypeSchema,
  meanGiven: z.number().finite().min(0).max(4).nullable(),
  deviation: z.number().finite().nullable(),
  isProvisional: z.boolean(),
  responseCount: z.number().int().nonnegative(),
})
export type CalibratedRater = z.infer<typeof calibratedRaterSchema>

export const evaluationDomainSchema = z.object({
  period: periodRefSchema.nullable(),
  overallScore: z.number().finite().min(0).max(100).nullable(),
  performanceBand: z.string().nullable(),
  momentumDelta: z.number().finite().nullable(),
  momentumBand: z.string().nullable(),
  consensus: z.number().finite().min(0).max(1).nullable(),
  companyBaseline: z.number().finite().min(0).max(100).nullable(),
  selfVsOthersGap: z.number().finite().nullable(),
  lenses: z.array(evaluationLensSchema).default([]),
  history: z.array(evaluationHistoryPointSchema).default([]),
  raters: z.array(calibratedRaterSchema).default([]),
})
export type EvaluationDomain = z.infer<typeof evaluationDomainSchema>

export const clientAssignmentSchema = z.object({
  clientId: z.string().min(1),
  clientName: z.string().min(1),
  role: z.enum(['MANAGER', 'MEMBER']),
  assignedAt: z.string().datetime(),
  tenureDays: z.number().int().nonnegative(),
  teamSize: z.number().int().nonnegative().nullable(),
})
export type Employee360ClientAssignment = z.infer<typeof clientAssignmentSchema>

export const clientConcentrationSchema = z.object({
  /** Null when two or more clients tie for the largest recorded share. */
  primaryClientId: z.string().min(1).nullable(),
  primaryClientName: z.string().min(1).nullable(),
  share: z.number().finite().min(0).max(1),
  basis: z.literal('ASSIGNMENT_COUNT'),
})
export type ClientConcentration = z.infer<typeof clientConcentrationSchema>

export const clientCollaboratorSchema = z.object({
  employeeId: z.string().min(1),
  name: z.string().min(1),
  position: z.string().nullable(),
  sharedClients: z.array(z.object({ id: z.string().min(1), name: z.string().min(1) })).default([]),
})
export type ClientCollaborator = z.infer<typeof clientCollaboratorSchema>

export const clientFootprintSchema = z.object({
  assignments: z.array(clientAssignmentSchema).default([]),
  concentration: clientConcentrationSchema.nullable(),
  collaborators: z.array(clientCollaboratorSchema).default([]),
  outcomeEvidenceAvailable: z.literal(false),
})
export type ClientFootprint = z.infer<typeof clientFootprintSchema>

export const salaryHistoryPointSchema = z.object({
  effectiveFrom: z.string().datetime(),
  amount: z.number().finite().positive(),
  currency: z.string().trim().min(1),
  periodId: z.string().nullable(),
  periodName: z.string().nullable(),
})
export type SalaryHistoryPoint = z.infer<typeof salaryHistoryPointSchema>

export const salaryChangeEventSchema = z.object({
  effectiveFrom: z.string().datetime(),
  previousAmount: z.number().finite().positive(),
  amount: z.number().finite().positive(),
  delta: z.number().finite(),
  percentChange: z.number().finite().nullable(),
  currency: z.string().trim().min(1),
  periodId: z.string().nullable(),
  periodName: z.string().nullable(),
})
export type SalaryChangeEvent = z.infer<typeof salaryChangeEventSchema>

export const compensationDomainSchema = z.object({
  /**
   * Null when the observations contain multiple currencies. History remains
   * available in that case, but no cross-currency growth is asserted.
   */
  currency: z.string().trim().min(1).nullable(),
  currentBasic: z.number().finite().positive().nullable(),
  currencies: z.array(z.string().trim().min(1)).default([]),
  history: z.array(salaryHistoryPointSchema).default([]),
  changeEvents: z.array(salaryChangeEventSchema).default([]),
  growth: z.number().finite().nullable(),
})
export type CompensationDomain = z.infer<typeof compensationDomainSchema>

export const operationsDomainSchema = z.object({
  asOf: z.string().datetime().nullable(),
  openTasks: z.number().int().nonnegative().nullable(),
  overdueTasks: z.number().int().nonnegative().nullable(),
  recentCompletions: z.number().int().nonnegative().nullable(),
  approvedWorkingLeaveDays: z.number().finite().nonnegative().nullable(),
  approvedLeaveRequests: z.number().int().nonnegative().nullable(),
})
export type OperationsDomain = z.infer<typeof operationsDomainSchema>

export const personNodeSchema = z
  .object({
    employeeId: z.string().min(1).nullable(),
    /**
     * A display label. For an unrevealed evaluator this is a relationship label
     * such as "Peer evaluator", never the person's real name.
     */
    name: z.string().min(1),
    position: z.string().nullable(),
    identityRevealed: z.boolean(),
  })
  .superRefine((value, context) => {
    if (value.identityRevealed && value.employeeId === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A revealed network person must have an employee id',
        path: ['employeeId'],
      })
    }
    if (!value.identityRevealed && (value.employeeId !== null || value.position !== null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'An unrevealed network person cannot expose identity fields',
        path: ['employeeId'],
      })
    }
  })

export const networkEdgeSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['LEAD', 'REPORT', 'EVALUATOR', 'SHARED_CLIENT']),
  label: z.string().min(1),
  person: personNodeSchema,
  sharedClientNames: z.array(z.string().min(1)).default([]),
})
export type Employee360NetworkEdge = z.infer<typeof networkEdgeSchema>

export const networkDomainSchema = z.object({
  edges: z.array(networkEdgeSchema).default([]),
})
export type NetworkDomain = z.infer<typeof networkDomainSchema>

export const timelineEventSchema = z.object({
  id: z.string().min(1),
  occurredAt: z.string().datetime(),
  kind: z.enum([
    'EVALUATION',
    'COMPENSATION',
    'CLIENT_ASSIGNMENT',
    'LEAVE',
    'TASK',
  ]),
  title: z.string().min(1),
  detail: z.string().nullable(),
  source: z.string().min(1),
  asOf: z.string().datetime(),
})
export type Employee360TimelineEvent = z.infer<typeof timelineEventSchema>

export const employeeDossierSchema = z
  .object({
    identity: identitySchema,
    employment: z.object({
      status: employmentStatusSchema,
      joinedAt: z.string().datetime().nullable(),
      exitedAt: z.string().datetime().nullable(),
    }),
    availability: domainAvailabilitySchema,
    signals: signalStripSchema,
    evaluation: evaluationDomainSchema,
    clientFootprint: clientFootprintSchema,
    compensation: compensationDomainSchema,
    operations: operationsDomainSchema,
    network: networkDomainSchema,
    timeline: z.array(timelineEventSchema).default([]),
  })
  .superRefine((value, context) => {
    const issue = (path: Array<string | number>, message: string) =>
      context.addIssue({ code: z.ZodIssueCode.custom, path, message })

    if (value.availability.evaluation === 'NO_DATA') {
      if (
        value.signals.performance !== null ||
        value.signals.momentum !== null ||
        value.signals.evaluatorConsensus !== null ||
        value.evaluation.overallScore !== null ||
        value.evaluation.performanceBand !== null ||
        value.evaluation.momentumDelta !== null ||
        value.evaluation.momentumBand !== null ||
        value.evaluation.consensus !== null ||
        value.evaluation.companyBaseline !== null ||
        value.evaluation.selfVsOthersGap !== null ||
        value.evaluation.lenses.length > 0 ||
        value.evaluation.history.length > 0 ||
        value.evaluation.raters.length > 0
      ) {
        issue(
          ['availability', 'evaluation'],
          'NO_DATA evaluation availability cannot carry evaluation values'
        )
      }
    }

    if (value.availability.clients === 'NO_DATA') {
      if (
        value.signals.clientFootprint !== null ||
        value.clientFootprint.assignments.length > 0 ||
        value.clientFootprint.concentration !== null ||
        value.clientFootprint.collaborators.length > 0
      ) {
        issue(
          ['availability', 'clients'],
          'NO_DATA client availability cannot carry client values'
        )
      }
    }

    if (value.availability.compensation === 'NO_DATA') {
      if (
        value.signals.currentCompensation !== null ||
        value.signals.compensationChange !== null ||
        value.compensation.currency !== null ||
        value.compensation.currentBasic !== null ||
        value.compensation.currencies.length > 0 ||
        value.compensation.history.length > 0 ||
        value.compensation.changeEvents.length > 0 ||
        value.compensation.growth !== null
      ) {
        issue(
          ['availability', 'compensation'],
          'NO_DATA compensation availability cannot carry compensation values'
        )
      }
    }

    if (value.availability.operations === 'NO_DATA') {
      if (
        value.signals.workload !== null ||
        value.operations.asOf !== null ||
        value.operations.openTasks !== null ||
        value.operations.overdueTasks !== null ||
        value.operations.recentCompletions !== null ||
        value.operations.approvedWorkingLeaveDays !== null ||
        value.operations.approvedLeaveRequests !== null
      ) {
        issue(
          ['availability', 'operations'],
          'NO_DATA operations availability cannot carry operational values'
        )
      }
    }

    if (value.availability.network === 'NO_DATA' && value.network.edges.length > 0) {
      issue(
        ['availability', 'network'],
        'NO_DATA network availability cannot carry network edges'
      )
    }
  })
export type EmployeeDossier = z.infer<typeof employeeDossierSchema>

export const profilePayloadSchema = z
  .object({
    generatedAt: z.string().datetime(),
    selectedPeriod: periodRefSchema.nullable(),
    primary: employeeDossierSchema,
    comparison: employeeDossierSchema.nullable().optional(),
  })
  .superRefine((value, context) => {
    for (const [key, dossier] of [
      ['primary', value.primary],
      ['comparison', value.comparison],
    ] as const) {
      if (!dossier) continue
      if (dossier.evaluation.period?.id !== value.selectedPeriod?.id) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Dossier evaluation period must match the selected period',
          path: [key, 'evaluation', 'period'],
        })
      }
    }
  })
export type ProfilePayload = z.infer<typeof profilePayloadSchema>

export const structuredEvidenceResponseSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('TEXT'),
    section: z.string().nullable(),
    value: z.string(),
  }),
  z.object({
    type: z.literal('LIST'),
    section: z.string().nullable(),
    value: z.array(z.string()),
  }),
  z.object({
    type: z.literal('GOAL_TABLE'),
    section: z.string().nullable(),
    value: z.array(
      z.object({
        goal: z.string(),
        status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'EXCEEDED']),
        comments: z.string(),
      })
    ),
  }),
])
export type StructuredEvidenceResponse = z.infer<typeof structuredEvidenceResponseSchema>

const evaluatorRevealSchema = z
  .object({
    raterKey: z.string().min(1),
    canReveal: z.boolean(),
    isRevealed: z.boolean(),
    name: z.string().nullable(),
  })
  .superRefine((value, context) => {
    if (value.isRevealed && (!value.canReveal || !value.name)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A revealed evaluator must be revealable and have a name',
        path: ['name'],
      })
    }
    if (!value.isRevealed && value.name !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'An unrevealed evaluator name must be null',
        path: ['name'],
      })
    }
  })

export const evidenceItemSchema = z.object({
  id: z.string().min(1),
  lens: relationshipTypeSchema,
  question: z.string().min(1),
  response: z.string().nullable(),
  /** Present for structured self-evaluation answers; absent/null for normal feedback. */
  structuredResponse: structuredEvidenceResponseSchema.nullable().optional(),
  rating: z.number().finite().min(0).max(4).nullable(),
  evaluator: evaluatorRevealSchema,
  provenance: z.object({
    source: z.enum(['EVALUATION', 'SELF_EVALUATION']),
    recordId: z.string().min(1),
    submittedAt: z.string().datetime(),
    periodId: z.string().min(1),
    periodName: z.string().min(1),
  }),
})
export type EvidenceItem = z.infer<typeof evidenceItemSchema>

export const evidencePayloadSchema = z.object({
  generatedAt: z.string().datetime(),
  employeeId: z.string().min(1),
  period: periodRefSchema,
  domain: z.enum(['EVALUATION', 'SELF_EVALUATION']),
  lens: relationshipTypeSchema.nullable(),
  items: z.array(evidenceItemSchema).default([]),
})
export type EvidencePayload = z.infer<typeof evidencePayloadSchema>
