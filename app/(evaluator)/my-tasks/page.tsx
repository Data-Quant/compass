'use client'

import { LegacyMyTasksView } from '@/components/my-tasks/LegacyMyTasksView'
import { MyTasksWorkspace } from '@/components/my-tasks/MyTasksWorkspace'
import { FEATURE_MY_TASKS_V2 } from '@/lib/config'

export default function MyTasksPage() {
  if (!FEATURE_MY_TASKS_V2) {
    return <LegacyMyTasksView />
  }

  return <MyTasksWorkspace />
}
