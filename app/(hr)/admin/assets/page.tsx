'use client'

import { AssetsManagerWorkspace } from '@/components/assets/AssetsManagerWorkspace'

export default function AdminAssetsPage() {
  return (
    <AssetsManagerWorkspace
      title="Equipment Registry"
      description="Manage inventory, assignment, warranty windows, and cost metadata."
      detailBasePath="/admin/assets"
    />
  )
}

