import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { sendTicketStatusNotification } from '@/lib/email'
import { Prisma } from '@prisma/client'

const VALID_STATUSES = ['OPEN', 'UNDER_REVIEW', 'SOLUTION', 'RESOLVED'] as const

// PATCH - Update device ticket status (HR only)
export async function PATCH(request: NextRequest) {
    try {
        const user = await getSession()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        if (user.role !== 'HR') {
            return NextResponse.json({ error: 'Only HR can update tickets' }, { status: 403 })
        }

        const body = await request.json()
        const { ticketId, status, solution, hrNotes } = body

        if (!ticketId) {
            return NextResponse.json({ error: 'Ticket ID is required' }, { status: 400 })
        }

        // Validate status if provided
        if (status && !VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
            return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
        }

        // Find the ticket
        const ticket = await prisma.deviceTicket.findUnique({
            where: { id: ticketId },
        })

        if (!ticket) {
            return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
        }

        const targetStatus = (status as (typeof VALID_STATUSES)[number] | undefined) ?? ticket.status
        const solutionFromRequest = typeof solution === 'string' ? solution.trim() : null
        const effectiveSolution = solution === undefined ? (ticket.solution?.trim() ?? '') : (solutionFromRequest ?? '')

        // Solution/response is required for these statuses.
        if ((targetStatus === 'SOLUTION' || targetStatus === 'RESOLVED') && !effectiveSolution) {
            return NextResponse.json(
                { error: 'Solution/response is required when setting status to Solution or Resolved' },
                { status: 400 }
            )
        }

        // Build update data
        const updateData: Prisma.DeviceTicketUpdateInput = {}

        if (status) {
            updateData.status = status as (typeof VALID_STATUSES)[number]

            // Set/clear resolved timestamp based on status.
            if (status === 'RESOLVED') {
                updateData.resolvedAt = new Date()
            } else {
                updateData.resolvedAt = null
            }
        }

        if (solution !== undefined) {
            updateData.solution = solutionFromRequest || null
        }

        if (hrNotes !== undefined) {
            updateData.hrNotes = typeof hrNotes === 'string' ? (hrNotes.trim() || null) : null
        }

        // Track who is handling this ticket
        updateData.hrAssignedTo = user.name

        const updatedTicket = await prisma.deviceTicket.update({
            where: { id: ticketId },
            data: updateData,
            include: {
                employee: {
                    select: { id: true, name: true, department: true, position: true, email: true },
                },
            },
        })

        // Send email notification on status change
        if (status && status !== ticket.status) {
            try {
                await sendTicketStatusNotification(ticketId)
            } catch (e) {
                console.error('Failed to send ticket status notification:', e)
            }
        }

        return NextResponse.json({ success: true, ticket: updatedTicket })
    } catch (error) {
        console.error('Failed to update device ticket:', error)
        return NextResponse.json({ error: 'Failed to update ticket' }, { status: 500 })
    }
}
