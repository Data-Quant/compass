import { PeerApproval } from '@/components/weekly/mapping/PeerApproval'

export const dynamic = 'force-dynamic'

/** The page an approval email links to. No sign-in: the token in the link is the credential. */
export default async function PeerRequestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center p-6">
      <PeerApproval token={token} />
    </main>
  )
}
