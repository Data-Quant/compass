import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManageSubscriptions } from '@/lib/permissions'
import {
  dedupeOwnerIds,
  SUBSCRIPTION_STATUSES,
  subscriptionMutationSchema,
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

export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !canManageSubscriptions(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const q = (searchParams.get('q') || '').trim()
    const team = (searchParams.get('team') || '').trim()
    const ownerId = (searchParams.get('ownerId') || '').trim()
    const status = (searchParams.get('status') || '').trim().toUpperCase()

    if (status && !SUBSCRIPTION_STATUSES.includes(status as (typeof SUBSCRIPTION_STATUSES)[number])) {
      return NextResponse.json({ error: 'Invalid status filter' }, { status: 400 })
    }

    const where: Prisma.SubscriptionWhereInput = {}

    if (status) {
      where.status = status as (typeof SUBSCRIPTION_STATUSES)[number]
    }

    if (team) {
      where.team = { equals: team, mode: 'insensitive' }
    }

    if (ownerId) {
      where.ownerLinks = { some: { userId: ownerId } }
    }

    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { team: { contains: q, mode: 'insensitive' } },
        { purpose: { contains: q, mode: 'insensitive' } },
        { usersText: { contains: q, mode: 'insensitive' } },
        { personInChargeText: { contains: q, mode: 'insensitive' } },
        { billedToText: { contains: q, mode: 'insensitive' } },
      ]
    }

    const [items, teams] = await Promise.all([
      prisma.subscription.findMany({
        where,
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
        orderBy: [{ name: 'asc' }],
      }),
      prisma.subscription.findMany({
        where: {
          team: { not: null },
        },
        distinct: ['team'],
        select: { team: true },
        orderBy: { team: 'asc' },
      }),
    ])

    return NextResponse.json({
      items,
      teams: teams
        .map((entry) => entry.team)
        .filter((entry): entry is string => Boolean(entry)),
    })
  } catch (error) {
    console.error('Failed to fetch subscriptions:', error)
    return NextResponse.json({ error: 'Failed to fetch subscriptions' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !canManageSubscriptions(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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

    const created = await prisma.subscription.create({
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
        ownerLinks: ownerIds.length
          ? {
              createMany: {
                data: ownerIds.map((ownerId) => ({ userId: ownerId })),
              },
            }
          : undefined,
      },
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

    return NextResponse.json({ success: true, item: created })
  } catch (error) {
    console.error('Failed to create subscription:', error)
    return NextResponse.json({ error: 'Failed to create subscription' }, { status: 500 })
  }
}
