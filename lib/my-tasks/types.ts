export type MyTaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE'
export type MyTaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'

export interface MyTaskProject {
  id: string
  name: string
  color: string | null
}

export interface MyTaskLabel {
  id: string
  name: string
  color: string
}

export interface MyTaskRecord {
  id: string
  title: string
  description: string | null
  status: MyTaskStatus
  priority: MyTaskPriority
  assigneeId: string | null
  dueDate: string | null
  startDate: string | null
  createdAt: string
  project: MyTaskProject
  labelAssignments: Array<{ label: MyTaskLabel }>
  _count: { comments: number }
}

export type SmartBucket = 'RECENTLY_ASSIGNED' | 'DO_TODAY' | 'DO_NEXT_WEEK' | 'DO_LATER'
