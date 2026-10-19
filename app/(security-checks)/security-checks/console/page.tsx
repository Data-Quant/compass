import { redirect } from 'next/navigation'

// Folded into the Security screen as a tab.
export default function SecurityConsolePage() {
  redirect('/security-checks?tab=overview')
}
