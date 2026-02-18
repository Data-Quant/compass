import { AssetDetailWorkspace } from '@/components/assets/AssetDetailWorkspace'

interface RouteContext {
  params: Promise<{ id: string }>
}

export default async function AdminAssetDetailPage(context: RouteContext) {
  const { id } = await context.params
  return <AssetDetailWorkspace assetId={id} listHref="/admin/assets" />
}

