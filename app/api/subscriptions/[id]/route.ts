import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManageSubscriptions } from '@/lib/permissions'
import {
  dedupeOwnerIds,
  subscriptionMutationSchema,
  subscriptionStatusMutationSchema,
} from '@/lib/subscriptions'

async function validateOwnerIds(ownerIds: string[]) {
  const normalizedOwnerIds = dedupeOwnerIds(ownerIds)
  if (normalizedOwnerIds.length === 0) return []

  const users = await prisma.user.findMany({
    where: { id: { in: normalizedOwnerIds } },
    select: { id: true },
  })

  if (users.length !== normalizedOwnerIds.length) {
    return null
  }

  return users.map((user) => user.id)
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession()
    if (!user || !canManageSubscriptions(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const parsed = subscriptionMutationSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request payload', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const ownerIds = await validateOwnerIds(parsed.data.ownerIds)
    if (ownerIds === null) {
      return NextResponse.json({ error: 'One or more selected owners are invalid' }, { status: 400 })
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.subscription.update({
        where: { id },
        data: {
          name: parsed.data.name,
          team: parsed.data.team || null,
          usersText: parsed.data.usersText || null,
          paymentMethodText: parsed.data.paymentMethodText || null,
          purpose: parsed.data.purpose || null,
          costText: parsed.data.costText || null,
          subscriptionTypeText: parsed.data.subscriptionTypeText || null,
          billedToText: parsed.data.billedToText || null,
          renewalText: parsed.data.renewalText || null,
          noticePeriodText: parsed.data.noticePeriodText || null,
          personInChargeText: parsed.data.personInChargeText || null,
          lastPaymentText: parsed.data.lastPaymentText || null,
          notes: parsed.data.notes || null,
          sourceSheet: parsed.data.sourceSheet || null,
          status: parsed.data.status,
        },
      })

      await tx.subscriptionOwner.deleteMany({
        where: { subscriptionId: id },
      })

      if (ownerIds.length > 0) {
        await tx.subscriptionOwner.createMany({
          data: ownerIds.map((ownerId) => ({
            subscriptionId: id,
            userId: ownerId,
          })),
        })
      }

      return tx.subscription.findUnique({
        where: { id },
        include: {
          ownerLinks: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  department: true,
                  role: true,
                },
              },
            },
            orderBy: {
              user: { name: 'asc' },
            },
          },
        },
      })
    })

    return NextResponse.json({ success: true, item: updated })
  } catch (error) {
    console.error('Failed to update subscription:', error)
    return NextResponse.json({ error: 'Failed to update subscription' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getSession()
    if (!user || !canManageSubscriptions(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const parsed = subscriptionStatusMutationSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid status payload', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const updated = await prisma.subscription.update({
      where: { id },
      data: { status: parsed.data.status },
      include: {
        ownerLinks: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                department: true,
                role: true,
              },
            },
          },
          orderBy: {
            user: { name: 'asc' },
          },
        },
      },
    })

    return NextResponse.json({ success: true, item: updated })
  } catch (error) {
    console.error('Failed to change subscription status:', error)
    return NextResponse.json({ error: 'Failed to change subscription status' }, { status: 500 })
  }
}
