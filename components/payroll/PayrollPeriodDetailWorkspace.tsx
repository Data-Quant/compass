'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AppNavbar } from '@/components/layout/AppNavbar'
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
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<any>(null)

  useEffect(() => {
    fetch('/api/auth/session')
      .then((res) => res.json())
      .then((data) => {
        if (!data.user || !canAccessPayrollWorkspace(data.user.role, appBasePath)) {
          router.push('/login')
          return
        }
        setUser(data.user)
        return loadPeriod()
      })
      .catch(() => router.push('/login'))
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

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
  }

  if (loading) return <LoadingScreen message="Loading payroll period..." />

  if (!period) {
    return (
      <div className="min-h-screen bg-background">
        <AppNavbar user={user} onLogout={handleLogout} badge={badge} />
        <main className="max-w-5xl mx-auto px-4 py-12">
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">Payroll period not found.</p>
              <Button className="mt-4" asChild>
                <Link href={`${appBasePath}/payroll`}>Back to Payroll</Link>
              </Button>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <AppNavbar user={user} onLogout={handleLogout} badge={badge} />
      <PayrollRunWizard
        appBasePath={appBasePath}
        periodId={periodId}
        badge={badge}
        period={period}
        user={user}
        onReload={loadPeriod}
        onLogout={handleLogout}
      />
    </div>
  )
}
