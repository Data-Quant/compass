import { NextResponse } from 'next/server'
import type { PayrollPeriodStatus, PayrollReceiptStatus } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { isAdminRole } from '@/lib/permissions'
import {
  FINALIZED_PAYROLL_PERIOD_STATUSES,
  USABLE_PAYROLL_RECEIPT_STATUSES,
} from '@/lib/analytics/employee-360'
import { buildHistoricalCompensationSeries } from '@/lib/analytics/historical-compensation'

export async function GET() {
  try {
    const session = await getSession()
    if (!session || !isAdminRole(session.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const [users, receipts] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true,
          name: true,
          department: true,
          position: true,
          payrollProfile: {
            select: {
              isPayrollActive: true,
              designation: true,
              salaryRevisions: {
                orderBy: { effectiveFrom: 'asc' },
                select: {
                  id: true,
                  effectiveFrom: true,
                  note: true,
                  lines: {
                    select: {
                      amount: true,
                      salaryHead: {
                        select: { code: true, name: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
      prisma.payrollReceipt.findMany({
        where: {
          userId: { not: null },
          status: {
            in: [...USABLE_PAYROLL_RECEIPT_STATUSES] as PayrollReceiptStatus[],
          },
          period: {
            status: {
              in: [...FINALIZED_PAYROLL_PERIOD_STATUSES] as PayrollPeriodStatus[],
            },
          },
        },
        select: {
          id: true,
          userId: true,
          receiptJson: true,
          period: {
            select: {
              id: true,
              label: true,
              periodStart: true,
              currency: true,
            },
          },
        },
        orderBy: { period: { periodStart: 'asc' } },
      }),
    ])

    const receiptsByUserId = new Map<string, typeof receipts>()
    for (const receipt of receipts) {
      if (!receipt.userId) continue
      const employeeReceipts = receiptsByUserId.get(receipt.userId) ?? []
      employeeReceipts.push(receipt)
      receiptsByUserId.set(receipt.userId, employeeReceipts)
    }

    const employees = users.map((user) => {
      const series = buildHistoricalCompensationSeries({
        receipts: (receiptsByUserId.get(user.id) ?? []).map((receipt) => ({
          id: receipt.id,
          periodId: receipt.period.id,
          periodName: receipt.period.label,
          effectiveFrom: receipt.period.periodStart.toISOString(),
          currency: receipt.period.currency,
          receiptJson: receipt.receiptJson,
        })),
        revisions: (user.payrollProfile?.salaryRevisions ?? []).map((revision) => ({
          id: revision.id,
          effectiveFrom: revision.effectiveFrom.toISOString(),
          note: revision.note,
          lines: revision.lines.map((line) => ({
            componentKey: line.salaryHead.code,
            componentName: line.salaryHead.name,
            amount: line.amount,
          })),
        })),
      })

      return {
        id: user.id,
        name: user.name,
        department: user.department,
        position: user.position ?? user.payrollProfile?.designation ?? null,
        isPayrollActive: user.payrollProfile?.isPayrollActive !== false,
        ...series,
      }
    })

    const currencies = [...new Set(employees.flatMap((employee) => employee.currencies))].sort()
    const employeesWithHistory = employees.filter((employee) => employee.points.length > 0)

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      summary: {
        employeeCount: employees.length,
        employeesWithHistory: employeesWithHistory.length,
        eventCount: employees.reduce((sum, employee) => sum + employee.events.length, 0),
        currencies,
      },
      employees,
    })
  } catch (error) {
    console.error('Failed to load historical compensation analytics:', error)
    return NextResponse.json(
      { error: 'Failed to load historical compensation analytics' },
      { status: 500 }
    )
  }
}
