import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createAssetLabelsPdfBuffer } from '@/lib/asset-qr'
import { prisma } from '@/lib/db'
import { canManageAssets } from '@/lib/permissions'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSession()
    if (!user || !canManageAssets(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    const asset = await prisma.equipmentAsset.findUnique({
      where: { id },
      select: {
        id: true,
        equipmentId: true,
        assetName: true,
        category: true,
        brand: true,
        model: true,
        serialNumber: true,
      },
    })

    if (!asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
    }

    const buffer = await createAssetLabelsPdfBuffer([asset], request.nextUrl.origin)

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${asset.equipmentId}-qr-label.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Failed to generate asset QR label:', error)
    return NextResponse.json({ error: 'Failed to generate asset QR label' }, { status: 500 })
  }
}
