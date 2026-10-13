import { redirect } from 'next/navigation'

// Folded into the Security screen as a tab.
export default function ReviewQueuePage() {
  redirect('/security-checks?tab=review')
}
