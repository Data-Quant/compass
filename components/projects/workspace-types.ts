import type { PanelTask, ProjectStatusSection } from './TaskDetailPanel'

export type WorkspacePriority = PanelTask['priority']
export type WorkspaceTaskStatus = PanelTask['status']
export type AssigneeFilter = 'ALL' | 'ME' | string
export type WorkspaceView = 'table' | 'kanban'
export type ProjectStatusFilter = 'CURRENT' | 'ALL' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED'
export type SortDirection = 'asc' | 'desc'
export type WorkspaceSortKey = 'status' | 'title' | 'project' | 'priority' | 'dueDate' | 'assignee' | 'notes' | 'variance'
export type KanbanColumnId = 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'DONE'

export interface WorkspacePerson {
  id: string
  name: string
}

export interface WorkspaceMember extends WorkspacePerson {
  role: string
}

export interface WorkspaceLabel {
  id: string
  name: string
  color: string
}

export interface WorkspaceSection extends ProjectStatusSection {
  isBacklog: boolean
}

export interface WorkspaceTask extends PanelTask {
  completedLate: boolean
  section: WorkspaceSection | null
}

export interface WorkspaceProject {
  id: string
  name: string
  description: string | null
  color: string | null
  status: string
  owner: WorkspacePerson
  members: WorkspaceMember[]
  canManage: boolean
  sections: WorkspaceSection[]
  labels: WorkspaceLabel[]
  tasks: WorkspaceTask[]
}

export interface ProjectsWorkspaceResponse {
  viewer: WorkspacePerson & { role: string }
  preference: { assigneeFilter: string | null }
  people: WorkspacePerson[]
  projects: WorkspaceProject[]
}

export interface WorkspaceProgress {
  completed: number
  total: number
  percent: number | null
}

export interface WorkspaceProjectView {
  project: WorkspaceProject
  scopedTasks: WorkspaceTask[]
  visibleActiveTasks: WorkspaceTask[]
  visibleBacklogTasks: WorkspaceTask[]
  progress: WorkspaceProgress
}

export interface TaskPatchRequest {
  title?: string
  description?: string | null
  priority?: WorkspacePriority
  dueDate?: string | null
  assigneeId?: string | null
  sectionId?: string
  status?: WorkspaceTaskStatus
}

export interface TaskOptimisticPatch extends Partial<WorkspaceTask> {
  assignee?: WorkspacePerson | null
  section?: WorkspaceSection | null
}

export type WorkspaceBulkAction =
  | { action: 'ASSIGNEE'; assigneeId: string | null }
  | { action: 'PRIORITY'; priority: WorkspacePriority }
  | { action: 'SHIFT_DUE_DATE'; days: number }
