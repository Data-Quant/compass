import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { queueEmails, sendEmail, sendBatchEmails } from '@/lib/email'
import { prisma } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || user.role !== 'HR') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { action, periodId, emailQueueId } = await request.json()

    if (action === 'queue') {
      if (!periodId) {
        return NextResponse.json(
          { error: 'periodId is required' },
          { status: 400 }
        )
      }
      const queueEntries = await queueEmails(periodId)
      return NextResponse.json({ success: true, queueEntries })
    }

    if (action === 'send') {
      if (!emailQueueId) {
        return NextResponse.json(
          { error: 'emailQueueId is required' },
          { status: 400 }
        )
      }
      const result = await sendEmail(emailQueueId)
      return NextResponse.json({ success: true, result })
    }

    if (action === 'send-batch') {
      if (!periodId) {
        return NextResponse.json(
          { error: 'periodId is required' },
          { status: 400 }
        )
      }
      const results = await sendBatchEmails(periodId)
      return NextResponse.json({ success: true, results })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Failed to process email action:', error)
    return NextResponse.json(
      { error: 'Failed to process email action' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || user.role !== 'HR') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const periodId = searchParams.get('periodId')

    if (!periodId) {
      return NextResponse.json(
        { error: 'periodId is required' },
        { status: 400 }
      )
    }

    const queueEntries = await prisma.emailQueue.findMany({
      where: {
        report: {
          periodId,
        },
      },
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        report: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return NextResponse.json({ queueEntries })
  } catch (error) {
    console.error('Failed to fetch email queue:', error)
    return NextResponse.json(
      { error: 'Failed to fetch email queue' },
      { status: 500 }
    )
  }
}
