import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { createAssetLabelsPdfBuffer } from '@/lib/asset-qr'
import { prisma } from '@/lib/db'
import { canManageAssets } from '@/lib/permissions'

export const runtime = 'nodejs'

const bulkLabelSchema = z.object({
  assetIds: z.array(z.string().trim().min(1)).min(1).max(300),
})

export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !canManageAssets(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = bulkLabelSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Select between 1 and 300 assets', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const requestedIds = [...new Set(parsed.data.assetIds)]
    const assets = await prisma.equipmentAsset.findMany({
      where: { id: { in: requestedIds } },
      select: {
        id: true,
        equipmentId: true,
        assetName: true,
        category: true,
        brand: true,
        model: true,
        serialNumber: true,
        currentAssignee: { select: { name: true } },
      },
    })

    if (assets.length !== requestedIds.length) {
      return NextResponse.json({ error: 'One or more selected assets were not found' }, { status: 404 })
    }

    const byId = new Map(
      assets.map((asset) => [asset.id, { ...asset, ownerName: asset.currentAssignee?.name ?? null }])
    )
    const orderedAssets = requestedIds.map((id) => byId.get(id)!)
    const buffer = await createAssetLabelsPdfBuffer(orderedAssets, request.nextUrl.origin)

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="asset-qr-labels.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Failed to generate asset QR labels:', error)
    return NextResponse.json({ error: 'Failed to generate asset QR labels' }, { status: 500 })
  }
}
