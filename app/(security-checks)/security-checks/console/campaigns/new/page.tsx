import { notFound } from 'next/navigation'
import { CampaignEditor } from '@/components/security-checks/console/CampaignEditor'
import { isSecurityChecksEnabled } from '@/lib/security-checks/flag'

export const dynamic = 'force-dynamic'

export default function NewCampaignPage() {
  if (!isSecurityChecksEnabled()) notFound()
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 sm:p-8">
      <h1 className="font-display text-2xl font-bold text-foreground">New campaign</h1>
      <CampaignEditor />
    </div>
  )
}
