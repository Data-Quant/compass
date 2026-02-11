import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { sendTicketStatusNotification } from '@/lib/email'
import { Prisma } from '@prisma/client'

const VALID_STATUSES = ['OPEN', 'UNDER_REVIEW', 'SOLUTION', 'RESOLVED'] as const

// PATCH - Update device ticket status (HR/Security)
export async function PATCH(request: NextRequest) {
    try {
        const user = await getSession()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const isSupportUser = user.role === 'HR' || user.role === 'SECURITY'
        if (!isSupportUser) {
            return NextResponse.json({ error: 'Only HR or Security can update tickets' }, { status: 403 })
        }

        const body = await request.json()
        const { ticketId, status, solution, hrNotes, expectedResolutionDate } = body

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

        if (user.role === 'SECURITY' && hrNotes !== undefined) {
            return NextResponse.json({ error: 'Security users cannot update internal HR notes' }, { status: 403 })
        }

        let normalizedExpectedResolutionDate: Date | null | undefined = undefined
        if (expectedResolutionDate !== undefined) {
            if (!expectedResolutionDate) {
                normalizedExpectedResolutionDate = null
            } else {
                const parsed = new Date(expectedResolutionDate)
                if (Number.isNaN(parsed.getTime())) {
                    return NextResponse.json({ error: 'Invalid expected resolution date' }, { status: 400 })
                }
                normalizedExpectedResolutionDate = parsed
            }
        }

        const effectiveExpectedResolutionDate =
            normalizedExpectedResolutionDate === undefined ? ticket.expectedResolutionDate : normalizedExpectedResolutionDate

        // Solution/response is required for these statuses.
        if ((targetStatus === 'SOLUTION' || targetStatus === 'RESOLVED') && !effectiveSolution) {
            return NextResponse.json(
                { error: 'Solution/response is required when setting status to Solution or Resolved' },
                { status: 400 }
            )
        }

        if ((targetStatus === 'SOLUTION' || targetStatus === 'RESOLVED') && !effectiveExpectedResolutionDate) {
            return NextResponse.json(
                { error: 'Expected resolution date is required when setting status to Solution or Resolved' },
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

        if (normalizedExpectedResolutionDate !== undefined) {
            updateData.expectedResolutionDate = normalizedExpectedResolutionDate
        }

        if (hrNotes !== undefined) {
            if (user.role === 'HR') {
                updateData.hrNotes = typeof hrNotes === 'string' ? (hrNotes.trim() || null) : null
            }
        }

        // Track who is handling this ticket
        updateData.hrAssignedTo = user.name

        await prisma.deviceTicket.update({
            where: { id: ticketId },
            data: updateData,
        })

        const updatedTicket = user.role === 'HR'
            ? await prisma.deviceTicket.findUnique({
                where: { id: ticketId },
                include: {
                    employee: {
                        select: { id: true, name: true, department: true, position: true, email: true },
                    },
                },
            })
            : await prisma.deviceTicket.findUnique({
                where: { id: ticketId },
                select: {
                    id: true,
                    employeeId: true,
                    title: true,
                    description: true,
                    deviceType: true,
                    priority: true,
                    status: true,
                    hrAssignedTo: true,
                    solution: true,
                    expectedResolutionDate: true,
                    resolvedAt: true,
                    createdAt: true,
                    updatedAt: true,
                    employee: {
                        select: { id: true, name: true, department: true, position: true, email: true },
                    },
                },
            })

        if (!updatedTicket) {
            return NextResponse.json({ error: 'Ticket not found after update' }, { status: 404 })
        }

        // Notify employee + HR + Security when status/solution/deadline changes.
        const changedStatus = status && status !== ticket.status
        const changedSolution = solution !== undefined && (solutionFromRequest || null) !== ticket.solution
        const changedExpectedDate =
            normalizedExpectedResolutionDate !== undefined &&
            (ticket.expectedResolutionDate?.getTime() ?? 0) !== (normalizedExpectedResolutionDate?.getTime() ?? 0)

        if (changedStatus || changedSolution || changedExpectedDate) {
            try {
                await sendTicketStatusNotification(ticketId, user.name, user.role)
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
