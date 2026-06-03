import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createAssetQrPngBuffer } from '@/lib/asset-qr'
import { prisma } from '@/lib/db'
import { canManageAssets } from '@/lib/permissions'

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    const asset = await prisma.equipmentAsset.findUnique({
      where: { id },
      select: {
        id: true,
        equipmentId: true,
        currentAssigneeId: true,
      },
    })

    if (!asset) {
      return NextResponse.json({ error: 'Asset not found' }, { status: 404 })
    }

    if (!canManageAssets(user.role) && asset.currentAssigneeId !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const buffer = await createAssetQrPngBuffer(asset.equipmentId, request.nextUrl.origin)
    const disposition = request.nextUrl.searchParams.get('download') === '1' ? 'attachment' : 'inline'

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `${disposition}; filename="${asset.equipmentId}-qr.png"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Failed to generate asset QR code:', error)
    return NextResponse.json({ error: 'Failed to generate asset QR code' }, { status: 500 })
  }
}
