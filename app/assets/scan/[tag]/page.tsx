import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManageAssets } from '@/lib/permissions'

interface PageProps {
  params: Promise<{ tag: string }>
}

export default async function AssetQrScanPage({ params }: PageProps) {
  const { tag } = await params
  const user = await getSession()

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/assets/scan/${encodeURIComponent(tag)}`)}`)
  }

  const asset = await prisma.equipmentAsset.findUnique({
    where: { equipmentId: tag },
    select: {
      id: true,
      equipmentId: true,
      assetName: true,
      currentAssigneeId: true,
    },
  })

  if (!asset) {
    notFound()
  }

  if (canManageAssets(user.role)) {
    redirect(user.role === 'SECURITY' ? `/security/assets/${asset.id}` : `/admin/assets/${asset.id}`)
  }

  if (asset.currentAssigneeId === user.id) {
    redirect(`/device-support/assets/${encodeURIComponent(asset.equipmentId)}`)
  }

  return (
    <div className="mx-auto max-w-xl p-6 sm:p-8">
      <Card>
        <CardContent className="space-y-4 p-8 text-center">
          <div>
            <h1 className="font-display text-2xl font-semibold text-foreground">Asset access restricted</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {asset.equipmentId} is not currently assigned to you.
            </p>
          </div>
          <Button asChild>
            <Link href="/device-support">Device Support</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
