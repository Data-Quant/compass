'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { PayrollRunWizard } from '@/components/payroll/PayrollRunWizard'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface DetailProps {
  appBasePath: '/oa' | '/admin'
  periodId: string
  badge: string
}

function canAccessPayrollWorkspace(role: string | null | undefined, appBasePath: DetailProps['appBasePath']) {
  if (appBasePath === '/admin') return role === 'HR'
  return role === 'OA'
}

export function PayrollPeriodDetailWorkspace({ appBasePath, periodId, badge }: DetailProps) {
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<any>(null)

  useEffect(() => {
    loadPeriod()
  }, [periodId])

  const loadPeriod = async () => {
    try {
      const res = await fetch(`/api/payroll/periods/${periodId}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load payroll period')
      setPeriod(data.period)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load payroll period')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <LoadingScreen message="Loading payroll period..." />

  if (!period) {
    return (
      <div className="p-6 sm:p-8 max-w-5xl mx-auto">
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">Payroll period not found.</p>
            <Button className="mt-4" asChild>
              <Link href={`${appBasePath}/payroll`}>Back to Payroll</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <PayrollRunWizard
      appBasePath={appBasePath}
      periodId={periodId}
      badge={badge}
      period={period}
      user={null}
      onReload={loadPeriod}
      onLogout={() => {}}
    />
  )
}
