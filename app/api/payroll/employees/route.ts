import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManagePayroll } from '@/lib/permissions'
import { isEligiblePayrollEmployee, toPayrollEmployeeListItem } from '@/lib/payroll/employee-eligibility'
import { decryptSensitivePayrollProfileFields } from '@/lib/payroll/sensitive-fields'

export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !canManagePayroll(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const param = (key: string) =>
      request.nextUrl.searchParams.get(key) === 'true' || request.nextUrl.searchParams.get(key) === '1'

    // includePayrollDetails returns sensitive fields (bank, CNIC, salary) and is
    // for HR screens. includeOperational returns only logistical fields (distance,
    // transport, dates) safe to surface to O&A.
    const includePayrollDetails = param('includePayrollDetails')
    const includeOperational = param('includeOperational')
    const wantOperational = includePayrollDetails || includeOperational

    const users = await prisma.user.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        role: true,
        department: true,
        position: true,
        payrollProfile: {
          select: {
            isPayrollActive: true,
            designation: true,
            department: { select: { name: true } },
            employmentType: { select: { name: true } },
            ...(wantOperational
              ? {
                  joiningDate: true,
                  exitDate: true,
                  distanceKm: true,
                  transportMode: true,
                }
              : {}),
            ...(includePayrollDetails
              ? {
                  officialEmail: true,
                  cnicNumber: true,
                  bankName: true,
                  accountTitle: true,
                  accountNumber: true,
                  salaryRevisions: {
                    orderBy: { effectiveFrom: 'desc' },
                    take: 3,
                    include: {
                      lines: {
                        include: {
                          salaryHead: {
                            select: { id: true, code: true, name: true, type: true, isTaxable: true },
                          },
                        },
                      },
                    },
                  },
                }
              : {}),
          },
        },
      },
    })

    return NextResponse.json({
      employees: users
        .filter(isEligiblePayrollEmployee)
        .map((entry) =>
          toPayrollEmployeeListItem(
            {
              ...entry,
              payrollProfile: includePayrollDetails
                ? decryptSensitivePayrollProfileFields(entry.payrollProfile)
                : entry.payrollProfile,
            },
            { includePayrollDetails, includeOperational }
          )
        ),
    })
  } catch (error) {
    console.error('Failed to fetch payroll employees:', error)
    return NextResponse.json({ error: 'Failed to fetch payroll employees' }, { status: 500 })
  }
}
