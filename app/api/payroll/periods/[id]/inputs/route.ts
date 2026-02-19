import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManagePayroll } from '@/lib/permissions'
import { PAYROLL_COMPONENT_KEYS } from '@/lib/payroll/config'
import { normalizePayrollName } from '@/lib/payroll/normalizers'

const updateInputSchema = z.object({
  userId: z.string().trim().min(1).optional(),
  payrollName: z.string().trim().min(1),
  componentKey: z.string().trim().min(1),
  amount: z.coerce.number().finite(),
  note: z.string().trim().max(2000).optional(),
})

const expenseUpdateSchema = z.object({
  payrollName: z.string().trim().min(1).optional(),
  userId: z.string().trim().min(1).optional(),
  categoryKey: z.string().trim().min(1),
  description: z.string().trim().max(2000).optional(),
  amount: z.coerce.number().finite(),
})

const updateSchema = z.object({
  updates: z.array(updateInputSchema).default([]),
  expenses: z.array(expenseUpdateSchema).optional(),
  replaceExpenses: z.boolean().optional().default(false),
})

interface RouteContext {
  params: Promise<{ id: string }>
}

const EDIT_BLOCKED_STATUSES = new Set(['APPROVED', 'SENDING', 'SENT', 'LOCKED'])
const VALID_COMPONENT_KEYS = new Set(PAYROLL_COMPONENT_KEYS)

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const user = await getSession()
    if (!user || !canManagePayroll(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: periodId } = await context.params
    const period = await prisma.payrollPeriod.findUnique({
      where: { id: periodId },
      include: {
        inputValues: {
          orderBy: [{ payrollName: 'asc' }, { componentKey: 'asc' }],
        },
        expenseEntries: {
          orderBy: [{ categoryKey: 'asc' }, { payrollName: 'asc' }],
        },
        computedValues: {
          orderBy: [{ payrollName: 'asc' }, { metricKey: 'asc' }],
        },
      },
    })
    if (!period) {
      return NextResponse.json({ error: 'Payroll period not found' }, { status: 404 })
    }

    return NextResponse.json({
      period: {
        id: period.id,
        label: period.label,
        status: period.status,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
      },
      inputs: period.inputValues,
      expenses: period.expenseEntries,
      computed: period.computedValues,
    })
  } catch (error) {
    console.error('Failed to fetch payroll inputs:', error)
    return NextResponse.json({ error: 'Failed to fetch payroll inputs' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSession()
    if (!user || !canManagePayroll(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: periodId } = await context.params
    const period = await prisma.payrollPeriod.findUnique({
      where: { id: periodId },
      select: { id: true, status: true },
    })
    if (!period) {
      return NextResponse.json({ error: 'Payroll period not found' }, { status: 404 })
    }

    if (EDIT_BLOCKED_STATUSES.has(period.status)) {
      return NextResponse.json(
        { error: `Inputs cannot be edited in ${period.status} state` },
        { status: 400 }
      )
    }

    const body = await request.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request payload', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const { updates, expenses, replaceExpenses } = parsed.data
    const salaryHeads = await prisma.payrollSalaryHead.findMany({
      where: { isActive: true },
      select: { code: true },
    })
    const validKeys = new Set([
      ...VALID_COMPONENT_KEYS,
      ...salaryHeads.map((head) => head.code.toUpperCase()),
    ])

    for (const update of updates) {
      const componentKey = update.componentKey.toUpperCase()
      if (!validKeys.has(componentKey)) {
        return NextResponse.json({ error: `Invalid componentKey: ${update.componentKey}` }, { status: 400 })
      }
    }

    await prisma.$transaction(async (tx) => {
      for (const update of updates) {
        const payrollName = update.payrollName.trim()
        const componentKey = update.componentKey.toUpperCase()
        const normalized = normalizePayrollName(payrollName)
        const mapping = await tx.payrollIdentityMapping.findUnique({
          where: { normalizedPayrollName: normalized },
          select: { userId: true },
        })

        const previous = await tx.payrollInputValue.findUnique({
          where: {
            periodId_payrollName_componentKey: {
              periodId,
              payrollName,
              componentKey,
            },
          },
          select: {
            amount: true,
            userId: true,
          },
        })

        await tx.payrollInputValue.upsert({
          where: {
            periodId_payrollName_componentKey: {
              periodId,
              payrollName,
              componentKey,
            },
          },
          update: {
            userId: update.userId || mapping?.userId || null,
            amount: update.amount,
            sourceMethod: 'MANUAL',
            isOverride: true,
            note: update.note || null,
            provenanceJson: {
              updatedById: user.id,
              updatedAt: new Date().toISOString(),
              updateType: 'MANUAL_INPUT',
            },
          },
          create: {
            periodId,
            payrollName,
            userId: update.userId || mapping?.userId || null,
            componentKey,
            amount: update.amount,
            sourceMethod: 'MANUAL',
            isOverride: true,
            note: update.note || null,
            provenanceJson: {
              createdById: user.id,
              createdAt: new Date().toISOString(),
              createType: 'MANUAL_INPUT',
            },
          },
        })

        await tx.payrollInputAuditEvent.create({
          data: {
            periodId,
            userId: update.userId || mapping?.userId || previous?.userId || null,
            payrollName,
            componentKey,
            previousAmount: previous?.amount ?? null,
            newAmount: update.amount,
            reason: update.note || 'Manual payroll input update',
            actorId: user.id,
          },
        })
      }

      if (expenses) {
        if (replaceExpenses) {
          await tx.payrollExpenseEntry.deleteMany({ where: { periodId } })
        }

        if (expenses.length > 0) {
          await tx.payrollExpenseEntry.createMany({
            data: expenses.map((entry) => ({
              periodId,
              payrollName: entry.payrollName || null,
              userId: entry.userId || null,
              categoryKey: entry.categoryKey.toUpperCase(),
              description: entry.description || null,
              amount: entry.amount,
              enteredById: user.id,
              sheetName: null,
              rowRef: null,
            })),
          })
        }
      }

      await tx.payrollPeriod.update({
        where: { id: periodId },
        data: {
          status: 'DRAFT',
          updatedAt: new Date(),
        },
      })
    })

    return NextResponse.json({
      success: true,
      updatedInputs: updates.length,
      updatedExpenses: expenses?.length || 0,
    })
  } catch (error) {
    console.error('Failed to update payroll inputs:', error)
    return NextResponse.json({ error: 'Failed to update payroll inputs' }, { status: 500 })
  }
}
