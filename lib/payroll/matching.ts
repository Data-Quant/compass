import { prisma } from '@/lib/db'
import { normalizePayrollName } from '@/lib/payroll/normalizers'
import { PayrollIdentityStatus } from '@prisma/client'

export interface MappingSyncSummary {
  total: number
  autoMatched: number
  ambiguous: number
  unresolved: number
}

export async function syncPayrollIdentityMappings(payrollNames: string[]): Promise<MappingSyncSummary> {
  const uniqueNames = [...new Set(payrollNames.filter((n) => n.trim().length > 0))]
  const users = await prisma.user.findMany({
    select: { id: true, name: true },
  })

  const usersByNormalized = new Map<string, Array<{ id: string; name: string }>>()
  for (const user of users) {
    const key = normalizePayrollName(user.name)
    const list = usersByNormalized.get(key) || []
    list.push(user)
    usersByNormalized.set(key, list)
  }

  let autoMatched = 0
  let ambiguous = 0
  let unresolved = 0

  for (const displayName of uniqueNames) {
    const normalizedPayrollName = normalizePayrollName(displayName)
    const matches = usersByNormalized.get(normalizedPayrollName) || []

    let status: PayrollIdentityStatus = 'UNRESOLVED'
    let userId: string | null = null

    if (matches.length === 1) {
      status = 'AUTO_MATCHED'
      userId = matches[0].id
      autoMatched++
    } else if (matches.length > 1) {
      status = 'AMBIGUOUS'
      ambiguous++
    } else {
      unresolved++
    }

    await prisma.payrollIdentityMapping.upsert({
      where: { normalizedPayrollName },
      update: {
        displayPayrollName: displayName,
        userId,
        status,
        lastMatchedAt: userId ? new Date() : null,
      },
      create: {
        normalizedPayrollName,
        displayPayrollName: displayName,
        userId,
        status,
        lastMatchedAt: userId ? new Date() : null,
      },
    })
  }

  return {
    total: uniqueNames.length,
    autoMatched,
    ambiguous,
    unresolved,
  }
}

export async function resolvePayrollIdentityMapping(
  mappingId: string,
  userId: string,
  notes?: string
) {
  return prisma.payrollIdentityMapping.update({
    where: { id: mappingId },
    data: {
      userId,
      status: 'MANUAL_MATCHED',
      notes: notes || null,
      lastMatchedAt: new Date(),
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          department: true,
        },
      },
    },
  })
}
