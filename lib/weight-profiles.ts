import { CSV_CATEGORY_MAP, normalizeRelationshipTypeForWeighting, RELATIONSHIP_TYPE_LABELS, type RelationshipType } from '@/types'
import {
  PROFILE_CONSTANT_RELATIONSHIP_TYPES,
  shouldReceiveConstantEvaluations,
} from '@/lib/evaluation-profile-rules'
import { toCategorySetKey } from '@/types'

type WeightRow = {
  relationshipType: RelationshipType
  weight: number
}

type ProfileUser = {
  id: string
  name: string
  department?: string | null
}

type ProfileMapping = {
  evaluateeId: string
  relationshipType: RelationshipType
}

export interface WeightProfileSeedDefinition {
  displayName: string
  weights: Record<string, number>
}

export interface WorkbookProfileDefinition extends WeightProfileSeedDefinition {
  profileName: string
  categorySetKey: string
  expectedMembers: string[]
  memberBlob: string
}

export const WEIGHT_PROFILE_DISPLAY_ORDER: RelationshipType[] = [
  'TEAM_LEAD',
  'DIRECT_REPORT',
  'PEER',
  'HR',
  'C_LEVEL',
  'DEPT',
]

export const WORKBOOK_SHEET_NAMES = {
  mappings: 'Sheet1',
  profiles: 'Sheet2',
} as const

export const STANDARD_WEIGHT_PROFILES: WeightProfileSeedDefinition[] = [
  {
    displayName: 'Team Lead, HR, Dept',
    weights: { TEAM_LEAD: 0.45, HR: 0.10, DEPT: 0.45 },
  },
  {
    displayName: 'Team Lead, Peer, HR, Dept',
    weights: { TEAM_LEAD: 0.35, PEER: 0.20, HR: 0.10, DEPT: 0.35 },
  },
  {
    displayName: 'Team Lead, Direct Reports (Team Members), Peer, HR, Dept',
    weights: { TEAM_LEAD: 0.30, DIRECT_REPORT: 0.15, PEER: 0.15, HR: 0.10, DEPT: 0.30 },
  },
  {
    displayName: 'Team Lead, Peer, HR, C-Level (Hamiz), Dept',
    weights: { TEAM_LEAD: 0.25, PEER: 0.15, HR: 0.10, C_LEVEL: 0.30, DEPT: 0.20 },
  },
  {
    displayName: 'Team Lead, Direct Reports (Team Members), Peer, HR, C-Level (Hamiz), Dept',
    weights: { TEAM_LEAD: 0.20, DIRECT_REPORT: 0.15, PEER: 0.15, HR: 0.05, C_LEVEL: 0.25, DEPT: 0.20 },
  },
  {
    displayName: 'Direct Reports (Team Members), HR, C-Level (Hamiz), Dept',
    weights: { DIRECT_REPORT: 0.20, HR: 0.10, C_LEVEL: 0.35, DEPT: 0.35 },
  },
  {
    displayName: 'Peer, HR, C-Level (Hamiz), Dept',
    weights: { PEER: 0.30, HR: 0.10, C_LEVEL: 0.30, DEPT: 0.30 },
  },
  {
    displayName: 'Direct Reports (Team Members), Peer, HR, C-Level (Hamiz), Dept',
    weights: { DIRECT_REPORT: 0.20, PEER: 0.20, HR: 0.10, C_LEVEL: 0.25, DEPT: 0.25 },
  },
  {
    displayName: 'Direct Reports (Team Members), Peer, HR, Dept',
    weights: { DIRECT_REPORT: 0.25, PEER: 0.30, HR: 0.10, DEPT: 0.35 },
  },
]

export function parseCsvCategorySet(csvCategoryString: string): RelationshipType[] {
  const parts = csvCategoryString.split(',').map((value) => value.trim())
  const types: RelationshipType[] = []

  for (const part of parts) {
    const mapped = CSV_CATEGORY_MAP[part]
    if (mapped) {
      types.push(mapped)
    }
  }

  return [...new Set(types)]
}

export function getWeightProfileCategoryTypes(weights: Record<string, number>): RelationshipType[] {
  return Object.entries(weights)
    .filter(([, weight]) => Number(weight) > 0)
    .map(([relationshipType]) => relationshipType as RelationshipType)
}

export function buildWeightProfileDisplayName(types: RelationshipType[]) {
  return WEIGHT_PROFILE_DISPLAY_ORDER
    .filter((type) => types.includes(type))
    .map((type) => RELATIONSHIP_TYPE_LABELS[type])
    .join(', ')
}

export function toSeededWeightProfiles() {
  return STANDARD_WEIGHT_PROFILES.map((profile) => {
    const categoryTypes = getWeightProfileCategoryTypes(profile.weights)
    return {
      ...profile,
      categoryTypes,
      categorySetKey: toCategorySetKey(categoryTypes),
    }
  })
}

function normalizeWorkbookMemberBlob(value: string) {
  return value.toLowerCase().replace(/\s+/g, '')
}

function normalizeWorkbookMemberName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, '')
}

export function extractWorkbookProfileMembers(
  memberBlob: string,
  candidateNames: string[]
) {
  const normalizedBlob = normalizeWorkbookMemberBlob(memberBlob)
  return [...candidateNames]
    .sort((a, b) => normalizeWorkbookMemberName(b).length - normalizeWorkbookMemberName(a).length)
    .filter((name) => normalizedBlob.includes(normalizeWorkbookMemberName(name)))
    .sort((a, b) => a.localeCompare(b))
}

export function buildWorkbookProfileDefinition(input: {
  profileName: string
  weightRows: WeightRow[]
  memberBlob?: string
  candidateNames?: string[]
}) {
  const weights = Object.fromEntries(
    input.weightRows
      .filter((row) => row.weight > 0)
      .map((row) => [row.relationshipType, row.weight])
  )
  const categoryTypes = getWeightProfileCategoryTypes(weights)
  const displayName = buildWeightProfileDisplayName(categoryTypes)
  const categorySetKey = toCategorySetKey(categoryTypes)
  const memberBlob = input.memberBlob || ''
  const expectedMembers = extractWorkbookProfileMembers(memberBlob, input.candidateNames || [])

  return {
    profileName: input.profileName,
    displayName,
    categorySetKey,
    weights,
    expectedMembers,
    memberBlob,
  }
}

export function analyzeWeightProfileAssignments(input: {
  profiles: Array<{ categorySetKey: string; displayName: string; weights: Record<string, number> }>
  users: ProfileUser[]
  mappings: ProfileMapping[]
}) {
  const profileMap = new Map(input.profiles.map((profile) => [profile.categorySetKey, profile]))
  const normalizedMappings = input.mappings.map((mapping) => ({
    ...mapping,
    relationshipType: normalizeRelationshipTypeForWeighting(mapping.relationshipType) as RelationshipType,
  }))
  const mappingsByEvaluatee = new Map<string, Set<RelationshipType>>()

  for (const mapping of normalizedMappings) {
    if (mapping.relationshipType === 'SELF') continue
    if (!mappingsByEvaluatee.has(mapping.evaluateeId)) {
      mappingsByEvaluatee.set(mapping.evaluateeId, new Set())
    }
    mappingsByEvaluatee.get(mapping.evaluateeId)!.add(mapping.relationshipType)
  }

  const employeeCounts: Record<string, number> = {}
  const assignments = new Map<string, { categorySetKey: string; displayName: string | null }>()
  const unmatchedCategorySets = new Map<
    string,
    {
      categorySetKey: string
      employeeNames: string[]
      likelyMissingConstantTypes: RelationshipType[]
    }
  >()

  const savedKeys = new Set(profileMap.keys())

  for (const user of input.users) {
    if (!shouldReceiveConstantEvaluations(user)) {
      continue
    }

    const categoryTypes = [...(mappingsByEvaluatee.get(user.id) || new Set<RelationshipType>())]
    const categorySetKey = toCategorySetKey(categoryTypes)
    if (!categorySetKey) {
      continue
    }

    employeeCounts[categorySetKey] = (employeeCounts[categorySetKey] || 0) + 1
    const matchedProfile = profileMap.get(categorySetKey)
    assignments.set(user.id, {
      categorySetKey,
      displayName: matchedProfile?.displayName || null,
    })

    if (!matchedProfile) {
      const likelyMissingConstantTypes = getLikelyMissingConstantTypes(categoryTypes, savedKeys)
      if (!unmatchedCategorySets.has(categorySetKey)) {
        unmatchedCategorySets.set(categorySetKey, {
          categorySetKey,
          employeeNames: [],
          likelyMissingConstantTypes,
        })
      }
      unmatchedCategorySets.get(categorySetKey)!.employeeNames.push(user.name)
    }
  }

  const mismatchedEmployees = [...unmatchedCategorySets.values()]
    .flatMap((entry) =>
      entry.employeeNames.map((employeeName) => ({
        employeeName,
        categorySetKey: entry.categorySetKey,
        likelyMissingConstantTypes: entry.likelyMissingConstantTypes,
      }))
    )
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName))

  return {
    employeeCounts,
    assignments,
    unmatchedCategorySets: [...unmatchedCategorySets.values()]
      .map((entry) => ({
        ...entry,
        employeeNames: [...entry.employeeNames].sort((a, b) => a.localeCompare(b)),
        employeeCount: entry.employeeNames.length,
      }))
      .sort((a, b) => a.categorySetKey.localeCompare(b.categorySetKey)),
    mismatchedEmployees,
  }
}

function getLikelyMissingConstantTypes(
  categoryTypes: RelationshipType[],
  savedKeys: Set<string>
) {
  const missingConstantTypes = PROFILE_CONSTANT_RELATIONSHIP_TYPES.filter(
    (type) => !categoryTypes.includes(type)
  )

  const matchesWithMissingConstants = missingConstantTypes.filter((type) =>
    savedKeys.has(toCategorySetKey([...categoryTypes, type]))
  )

  if (matchesWithMissingConstants.length > 0) {
    return matchesWithMissingConstants
  }

  if (
    missingConstantTypes.length > 1 &&
    savedKeys.has(toCategorySetKey([...categoryTypes, ...missingConstantTypes]))
  ) {
    return missingConstantTypes
  }

  return [] as RelationshipType[]
}
