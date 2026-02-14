'use client'

import { useMemo } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { PayrollStatusBadge } from '@/components/payroll/PayrollStatusBadge'
import { PayrollPayStub } from '@/components/payroll/PayrollPayStub'
import { Separator } from '@/components/ui/separator'

interface PayrollEmployeeDetailProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  payrollName: string | null
  periodLabel: string
  receipts: Array<{
    id: string
    payrollName: string
    receiptJson: any
    status: string
    user?: { name?: string; email?: string } | null
    envelopes?: Array<{
      id: string
      status: string
      sentAt?: string
      completedAt?: string
    }>
  }>
}

export function PayrollEmployeeDetail({
  open,
  onOpenChange,
  payrollName,
  periodLabel,
  receipts,
}: PayrollEmployeeDetailProps) {
  const receipt = useMemo(() => {
    if (!payrollName) return null
    return receipts.find((r) => r.payrollName === payrollName) || null
  }, [payrollName, receipts])

  const envelope = useMemo(() => {
    if (!receipt?.envelopes?.length) return null
    return receipt.envelopes[0]
  }, [receipt])

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-display">{payrollName || 'Employee Detail'}</SheetTitle>
          <SheetDescription>{periodLabel}</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* DocuSign Status */}
          {receipt && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Receipt Status</span>
                <PayrollStatusBadge status={receipt.status} />
              </div>
              {envelope && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">DocuSign</span>
                    <PayrollStatusBadge status={envelope.status} />
                  </div>
                  {envelope.sentAt && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Sent</span>
                      <span className="text-sm">{new Date(envelope.sentAt).toLocaleString()}</span>
                    </div>
                  )}
                  {envelope.completedAt && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Completed</span>
                      <span className="text-sm">{new Date(envelope.completedAt).toLocaleString()}</span>
                    </div>
                  )}
                </>
              )}
              <Separator />
            </div>
          )}

          {/* Pay Stub */}
          {receipt ? (
            <PayrollPayStub
              payrollName={payrollName || ''}
              periodLabel={periodLabel}
              receiptJson={receipt.receiptJson}
              recipientName={receipt.user?.name || undefined}
              recipientEmail={receipt.user?.email || undefined}
            />
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm">No receipt available for this employee.</p>
              <p className="text-xs mt-1">Run the payroll calculation to generate receipts.</p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
