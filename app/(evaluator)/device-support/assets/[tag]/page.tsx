import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { WarrantyBadge } from '@/components/assets/WarrantyBadge'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManageAssets } from '@/lib/permissions'

interface PageProps {
  params: Promise<{ tag: string }>
}

function formatDate(value: Date | null) {
  return value ? value.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'
}

export default async function DeviceSupportAssetDetailPage({ params }: PageProps) {
  const { tag } = await params
  const user = await getSession()

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/device-support/assets/${encodeURIComponent(tag)}`)}`)
  }

  const asset = await prisma.equipmentAsset.findUnique({
    where: { equipmentId: tag },
    include: {
      currentAssignee: {
        select: { id: true, name: true, department: true, position: true, email: true },
      },
    },
  })

  if (!asset) {
    notFound()
  }

  const canView = canManageAssets(user.role) || asset.currentAssigneeId === user.id
  if (!canView) {
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
              <Link href="/device-support">Back to Device Support</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 sm:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground">{asset.assetName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {asset.equipmentId} · {asset.category}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/device-support">Back</Link>
        </Button>
      </div>

      <Card>
        <CardContent className="grid gap-4 p-4 md:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground">Status</p>
            <Badge className="mt-1">{asset.status.replace(/_/g, ' ')}</Badge>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Condition</p>
            <Badge variant="outline" className="mt-1">{asset.condition}</Badge>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Warranty</p>
            <div className="mt-1">
              <WarrantyBadge warrantyEndDate={asset.warrantyEndDate?.toISOString() || null} />
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Location</p>
            <p className="mt-1 text-sm font-medium">{asset.location || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Brand / Model</p>
            <p className="mt-1 text-sm">{[asset.brand, asset.model].filter(Boolean).join(' / ') || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Serial Number</p>
            <p className="mt-1 text-sm">{asset.serialNumber || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Warranty Dates</p>
            <p className="mt-1 text-sm">
              {formatDate(asset.warrantyStartDate)} to {formatDate(asset.warrantyEndDate)}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Assigned To</p>
            <p className="mt-1 text-sm">{asset.currentAssignee?.name || '-'}</p>
          </div>
          <div className="md:col-span-4">
            <p className="text-xs text-muted-foreground">Notes</p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{asset.notes || '-'}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
