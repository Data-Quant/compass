import { SubscriptionManagementWorkspace } from '@/components/subscriptions/SubscriptionManagementWorkspace'

export default function AdminSubscriptionsPage() {
  return (
    <SubscriptionManagementWorkspace
      title="Subscription Management"
      description="Track active and canceled subscriptions, assign owners, and refresh the catalog from the canonical workbook."
    />
  )
}
