import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManageSubscriptions } from '@/lib/permissions'
import { resolveSubscriptionOwners } from '@/lib/subscriptions'
import { parseSubscriptionWorkbook } from '@/lib/subscriptions-workbook'

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !canManageSubscriptions(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file')
    const replaceExisting = String(formData.get('replaceExisting') || 'true') !== 'false'

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Workbook file is required' }, { status: 400 })
    }

    const rows = await parseSubscriptionWorkbook(await file.arrayBuffer())
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { payrollProfile: { is: null } },
          { payrollProfile: { is: { isPayrollActive: true } } },
        ],
      },
      select: {
        id: true,
        name: true,
        department: true,
        role: true,
      },
      orderBy: { name: 'asc' },
    })

    let matchedOwners = 0
    let unresolvedOwnerRows = 0

    if (replaceExisting) {
      await prisma.subscription.deleteMany({})
    }

    for (const row of rows) {
      const ownerResolution = resolveSubscriptionOwners(row.personInChargeText, users)
      matchedOwners += ownerResolution.ownerIds.length
      if (ownerResolution.unresolvedTokens.length > 0) {
        unresolvedOwnerRows += 1
      }

      await prisma.subscription.create({
        data: {
          name: row.name,
          team: row.team,
          usersText: row.usersText,
          paymentMethodText: row.paymentMethodText,
          purpose: row.purpose,
          costText: row.costText,
          subscriptionTypeText: row.subscriptionTypeText,
          billedToText: row.billedToText,
          renewalText: row.renewalText,
          noticePeriodText: row.noticePeriodText,
          personInChargeText:
            ownerResolution.normalizedPersonInChargeText || row.personInChargeText,
          lastPaymentText: row.lastPaymentText,
          notes: row.notes,
          sourceSheet: row.sourceSheet,
          status: row.status,
          ownerLinks: ownerResolution.ownerIds.length > 0
            ? {
                createMany: {
                  data: ownerResolution.ownerIds.map((ownerId) => ({ userId: ownerId })),
                },
              }
            : undefined,
        },
      })
    }

    return NextResponse.json({
      success: true,
      imported: rows.length,
      activeImported: rows.filter((row) => row.status === 'ACTIVE').length,
      canceledImported: rows.filter((row) => row.status === 'CANCELED').length,
      matchedOwners,
      unresolvedOwnerRows,
      replacedExisting: replaceExisting,
    })
  } catch (error) {
    console.error('Failed to import subscriptions workbook:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to import workbook' },
      { status: 500 }
    )
  }
}
