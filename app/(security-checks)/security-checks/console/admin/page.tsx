import { redirect } from 'next/navigation'

// Folded into the Security screen as a tab.
export default function SecurityChecksAdminPage() {
  redirect('/security-checks?tab=admin')
}
