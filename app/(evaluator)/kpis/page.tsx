import { notFound } from 'next/navigation'
import { KpisWorkspace } from '@/components/kpi/KpisWorkspace'
import { isKpiEnabled } from '@/lib/kpi/flag'

export const dynamic = 'force-dynamic'

export default function KpisPage() {
  if (!isKpiEnabled()) notFound()
  return <KpisWorkspace />
}
