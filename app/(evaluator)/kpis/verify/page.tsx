import { notFound } from 'next/navigation'
import { VerifyWorkspace } from '@/components/kpi/VerifyWorkspace'
import { isKpiEnabled } from '@/lib/kpi/flag'

export const dynamic = 'force-dynamic'

export default function KpiVerifyPage() {
  if (!isKpiEnabled()) notFound()
  return <VerifyWorkspace />
}
