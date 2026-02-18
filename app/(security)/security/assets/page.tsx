'use client'

import { AssetsManagerWorkspace } from '@/components/assets/AssetsManagerWorkspace'

export default function SecurityAssetsPage() {
  return (
    <AssetsManagerWorkspace
      title="Equipment Registry"
      description="Track company equipment, assignment ownership, costs, and warranties."
      detailBasePath="/security/assets"
    />
  )
}

