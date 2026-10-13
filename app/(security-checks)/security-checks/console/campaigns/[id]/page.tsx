import { notFound } from 'next/navigation'
import { CampaignView } from '@/components/security-checks/console/CampaignView'
import { isSecurityChecksEnabled } from '@/lib/security-checks/flag'

export const dynamic = 'force-dynamic'

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  if (!isSecurityChecksEnabled()) notFound()
  const { id } = await params
  return <CampaignView campaignId={id} />
}
