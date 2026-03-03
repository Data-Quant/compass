import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { isAdminRole } from '@/lib/permissions'

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !isAdminRole(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id, confirmName } = (await request.json()) as {
      id?: string
      confirmName?: string
    }

    if (!id || !confirmName) {
      return NextResponse.json(
        { error: 'User ID and confirmation name are required' },
        { status: 400 }
      )
    }

    if (id === user.id) {
      return NextResponse.json(
        { error: 'Cannot delete your own account' },
        { status: 400 }
      )
    }

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true },
    })

    if (!target) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (confirmName !== target.name) {
      return NextResponse.json(
        { error: 'Confirmation name does not match' },
        { status: 400 }
      )
    }

    const name = target.name

    await prisma.$transaction([
      // Preserve the user's name on records before unlinking

      // EquipmentAssignment — store name then unlink employee
      prisma.equipmentAssignment.updateMany({
        where: { employeeId: id },
        data: { employeeName: name, employeeId: null },
      }),
      // EquipmentAssignment — store name then unlink assignedBy
      prisma.equipmentAssignment.updateMany({
        where: { assignedById: id },
        data: { assignedByName: name, assignedById: null },
      }),
      // PayrollPeriod — store name then unlink createdBy
      prisma.payrollPeriod.updateMany({
        where: { createdById: id },
        data: { createdByName: name, createdById: null },
      }),
      // PayrollImportBatch — store name then unlink importedBy
      prisma.payrollImportBatch.updateMany({
        where: { importedById: id },
        data: { importedByName: name, importedById: null },
      }),
      // PayrollExpenseEntry — store name then unlink enteredBy
      prisma.payrollExpenseEntry.updateMany({
        where: { enteredById: id },
        data: { enteredByName: name, enteredById: null },
      }),
      // PayrollApprovalEvent — store name then unlink actor
      prisma.payrollApprovalEvent.updateMany({
        where: { actorId: id },
        data: { actorName: name, actorId: null },
      }),
      // PayrollInputAuditEvent — store name then unlink actor
      prisma.payrollInputAuditEvent.updateMany({
        where: { actorId: id },
        data: { actorName: name, actorId: null },
      }),
      // PayrollSalaryRevision — store name then unlink createdBy
      prisma.payrollSalaryRevision.updateMany({
        where: { createdById: id },
        data: { createdByName: name, createdById: null },
      }),

      // Delete the user — cascaded relations auto-delete
      prisma.user.delete({ where: { id } }),
    ])

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to permanently delete user:', error)
    return NextResponse.json(
      { error: 'Failed to permanently delete user' },
      { status: 500 }
    )
  }
}
