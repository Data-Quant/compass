import { redirect } from 'next/navigation'

// The weekly admin page became the Evaluation round page; old links (emails, bookmarks) land on the matching tab.
const TABS: Record<string, string> = {
  setup: 'tab=overview', people: 'tab=people', dashboard: 'tab=progress', close: 'tab=results',
  content: 'tab=advanced&sub=content', review: 'tab=advanced&sub=review', live: 'tab=advanced&sub=live', ai: 'tab=advanced&sub=ai',
  challenges: 'tab=advanced&sub=challenges', survey: 'tab=advanced&sub=survey', test: 'tab=advanced&sub=test',
}

export default async function AdminWeeklyRedirect({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams
  redirect(`/admin/evaluation-round${tab && TABS[tab] ? `?${TABS[tab]}` : ''}`)
}
