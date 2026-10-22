# PM Board Tickets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Compass tickets assigned to Amjad in the "Compass PM tool - testing" project: auto-complete parent tasks, drag sections, click a row to open its project, sort columns by deadline, put "Add task" at the top of each column, project priority, shareable task links, co-assignee editing, and people search in assignee pickers.

**Architecture:** Pure decision functions live in `lib/` or `components/projects/workspace-utils.ts` and are unit-tested with `node:test`. API routes stay thin: they call these functions and keep side effects (activity, mail) in their own try/catch blocks, as the existing routes do. The UI changes reuse the existing dnd-kit setup in `BoardView.tsx` and `WorkspaceKanban.tsx`. The plan adds no new dependencies.

**Tech Stack:** Next.js 15 App Router, React 18, Prisma 5 / Postgres, dnd-kit (`@dnd-kit/core`, `@dnd-kit/sortable`), Tailwind + shadcn, `node:test` via tsx.

**Spec:** the Compass tickets (project `cmq55unw80001tsvc06uv5bt8`) plus the user's decisions from 2026-10-21:

| Ticket | id | Decision |
|---|---|---|
| Move a parent task to done if all its child tasks are marked as done | `cmv572cgp002n8b2j4raetn59` | If a child is reopened, the parent reopens to In Progress as well |
| Sprint Division | `cmv5742j8003b8b2j2k99kyb0` | **Out of scope.** Gets a separate spec later (see end) |
| Edit project priority | `cmv579n9g0013wl4e3boxioac` | Unblocked by PR #31 (drift fixed). Task 6 |
| Drag sections on board | `cmv57lxpu000nax40orlfnbs7` | Per-project board only (the cross-project board has fixed columns) |
| Click to open a project | `cmv57n7ku000vax405nqj2ax7` | Projects table row on `/projects` |
| Arrange tasks in order of deadline | `cmv595i3c0001ql06aw8kiw1h` | Both boards |
| Shareable link for tickets | `cmvi7zpf900013ny19m2et72b` | Task 7 |
| Assignees can't add co-assignees | `cmvi7zq3l00073ny13vre55ul` | Assignee and existing co-assignees can manage them. Task 8 |
| Search bar in assignee dropdown | `cmvj9ip2y0001hmcgbj0a9nqi` | All task views, assignee and co-assignee pickers. Task 9 |
| Add task option at the top | `cmv59699u000bql0629y08pth` | Both boards: the per-project board needs the change; the cross-project board already has it at the top of Backlog |

## Global Constraints

- Branch `feat/pm-board-tickets` off `main`. Open one PR to `Data-Quant/compass`. Commits follow the repo's style (`feat: …`, `fix: …`, plain-English subject).
- Add no new npm dependencies. Only Task 6 changes the Prisma schema, with exactly one new migration.
- Run tests on Node 22: `export PATH=~/.nvm/versions/node/v22.23.3/bin:$PATH`. Each task also runs `npx tsc --noEmit` and `npm run lint`.
- Only `canManage` users (HR, project owner, OWNER/LEAD members; `lib/project-access.ts:25`) may reorder sections. Task permissions keep using `canEditAssignedProjectTask`.
- Side effects never fail the request: wrap each one in its own try/catch with `console.error`, as `app/api/projects/[id]/tasks/route.ts:607-680` does.
- Error responses are `NextResponse.json({ error }, { status })`. Success responses include `success: true`.
- UI copy is short and plain, and matches existing labels ("Add task", "Open project").
- Interactive UI stays usable by keyboard. Section drag uses the existing `KeyboardSensor` and gets a labelled handle button.

## Review Focus

1. **Editing a child's title must not reopen a parent that was manually marked Done.** The parent sync runs only when a child's status, section or parent changes, or when a child is created or deleted. Pinned in Task 2 (`computeParentSyncTargets`).
2. **Backlog.** A parent in Backlog is never auto-promoted (promotion needs an assignee and a due date), and backlog children do not count toward "all children done". Pinned in Task 1.
3. **Grandparents.** Completing the last grandchild can complete the parent and then the grandparent. The walk up must stop on a cycle or after 10 levels. Pinned in Task 1 (`MAX_PARENT_SYNC_DEPTH`).
4. **Clicks inside the row's controls or portals** (checkbox, chevron popover, colour picker, name input, status select, actions menu) must not navigate. Pinned in Task 4.
5. **Undated tasks and equal deadlines.** Tasks without a due date go last, and ties keep their current server order, so cards don't jump around. Pinned in Task 5.

---

### Task 1: Parent status rule and sync helper

**Files:**
- Create: `lib/project-parent-completion.ts`
- Test: `tests/project-parent-completion.test.ts`

**Interfaces:**
- Consumes: `resolveTaskStatusSection` (`lib/project-status-sections.ts:238`), `getTaskStatusForSection` (`:112`), `shouldMarkTaskCompletedLate` (`lib/project-progress.ts:104`), `recordTaskActivity` (`lib/project-task-activity.ts`), `prisma` from `@/lib/db`.
- Produces:
  - `export const MAX_PARENT_SYNC_DEPTH = 10`
  - `export function resolveParentTaskStatus(parent: { status: TaskStatus; isBacklog: boolean }, children: Array<{ status: TaskStatus; isBacklog: boolean }>): 'DONE' | 'IN_PROGRESS' | null`
  - `export async function syncParentTaskStatus(input: { parentTaskId: string | null; actorId: string; origin: string }): Promise<string[]>`. It returns the ids of the ancestor tasks whose status changed, nearest first.

- [ ] **Step 1: Write the failing tests** in `tests/project-parent-completion.test.ts` (`node:test` + `assert/strict`, in the style of `tests/project-completion.test.ts`):

```ts
const child = (status: TaskStatus, isBacklog = false) => ({ status, isBacklog })
const parent = (status: TaskStatus, isBacklog = false) => ({ status, isBacklog })

test('completes an open parent when every child is done', () => {
  assert.equal(resolveParentTaskStatus(parent('IN_PROGRESS'), [child('DONE'), child('DONE')]), 'DONE')
  assert.equal(resolveParentTaskStatus(parent('TODO'), [child('DONE')]), 'DONE')
})
test('leaves the parent alone while any child is open', () => {
  assert.equal(resolveParentTaskStatus(parent('IN_PROGRESS'), [child('DONE'), child('TODO')]), null)
})
test('reopens a done parent to In Progress when a child is open again', () => {
  assert.equal(resolveParentTaskStatus(parent('DONE'), [child('DONE'), child('IN_PROGRESS')]), 'IN_PROGRESS')
})
test('a parent with no counted children is never changed', () => {
  assert.equal(resolveParentTaskStatus(parent('TODO'), []), null)
  assert.equal(resolveParentTaskStatus(parent('TODO'), [child('DONE', true)]), null)
})
test('backlog children do not count toward completion', () => {
  assert.equal(resolveParentTaskStatus(parent('TODO'), [child('DONE'), child('TODO', true)]), 'DONE')
})
test('a backlog parent is never auto-promoted or reopened', () => {
  assert.equal(resolveParentTaskStatus(parent('TODO', true), [child('DONE')]), null)
})
test('an already-done parent with all children done needs no change', () => {
  assert.equal(resolveParentTaskStatus(parent('DONE'), [child('DONE')]), null)
})
```

- [ ] **Step 2: Run them and check they fail**

Run: `node --import tsx --test tests/project-parent-completion.test.ts`
Expected: FAIL, cannot find module `../lib/project-parent-completion`.

- [ ] **Step 3: Implement `resolveParentTaskStatus` and `syncParentTaskStatus`** in `lib/project-parent-completion.ts`.
  - **`syncParentTaskStatus`.** Loop while `parentTaskId` is set and depth < `MAX_PARENT_SYNC_DEPTH`. Keep a `Set` of visited ids and stop on a repeat.
    - Load the parent: `id, projectId, status, dueDate, completedAt, completedLate, parentTaskId`, plus `section { isBacklog, isDone, canonicalStatus }`.
    - Load its children's `status` + `section.isBacklog`.
    - If `resolveParentTaskStatus` returns null, stop.
    - Otherwise:
      - Pick the section with `resolveTaskStatusSection({ projectId, sectionId: null, status: next, fallbackStatus: next })`. If it returns null, stop.
      - Update the parent's `sectionId`, `status`, `completedAt` (`new Date()` for DONE, `null` otherwise) and `completedLate` (via `shouldMarkTaskCompletedLate`), using the same rules as the PUT handler at `app/api/projects/[id]/tasks/route.ts:540-558`.
      - Record a `kind: 'status'` activity. Summary is "Moved to Done automatically because all subtasks are done" or "Reopened automatically because a subtask is open again". Pass no `notify`, so this sends no extra email.
      - Push the id, then continue with the parent's own `parentTaskId`.
  - Add a one-line doc comment like `syncProjectCompletion`'s: callers must swallow failures.

- [ ] **Step 4: Run the tests and check they pass**

Run: `node --import tsx --test tests/project-parent-completion.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/project-parent-completion.ts tests/project-parent-completion.test.ts
git commit -m "feat: decide a parent task's status from its subtasks"
```

### Task 2: Run the parent sync after task changes (API + workspace client)

**Files:**
- Modify: `app/api/projects/[id]/tasks/route.ts`. Change POST around `:356` (after the child-completed notification), PUT `:651-664` (before `syncProjectCompletion`), and DELETE (after the delete, before the project sync).
- Modify: `app/api/projects/[id]/sections/route.ts:192-203`. When the section DELETE moves tasks to another section, sync the distinct parents of the moved tasks.
- Modify: `components/projects/ProjectsWorkspace.tsx:409-411` (`patchTask` success branch).
- Create helper in: `lib/project-parent-completion.ts`
- Test: `tests/project-parent-completion.test.ts`

**Interfaces:**
- Consumes: `syncParentTaskStatus` and `MAX_PARENT_SYNC_DEPTH` from Task 1.
- Produces:
  - `export function computeParentSyncTargets(before: { status: TaskStatus; sectionId: string | null; parentTaskId: string | null } | null, after: { status: TaskStatus; sectionId: string | null; parentTaskId: string | null } | null): string[]`. It returns the parent ids to sync, without duplicates. `before = null` means the task was created, `after = null` means it was deleted.
  - The PUT, POST and DELETE responses gain `syncedParentTasks: Task[]`, loaded with `PROJECT_TASK_INCLUDE` and empty when nothing changed. It is a new field, so existing clients ignore it.

- [ ] **Step 1: Write the failing tests** (append to the same test file):

```ts
const t = (status: TaskStatus, parentTaskId: string | null, sectionId = 's1') => ({ status, sectionId, parentTaskId })

test('a title-only edit syncs nothing', () => {
  assert.deepEqual(computeParentSyncTargets(t('TODO', 'p1'), t('TODO', 'p1')), [])
})
test('a status or section change syncs the parent', () => {
  assert.deepEqual(computeParentSyncTargets(t('TODO', 'p1'), t('DONE', 'p1')), ['p1'])
  assert.deepEqual(computeParentSyncTargets(t('TODO', 'p1', 's1'), t('TODO', 'p1', 's2')), ['p1'])
})
test('re-parenting syncs both the old and the new parent', () => {
  assert.deepEqual(computeParentSyncTargets(t('DONE', 'p1'), t('DONE', 'p2')), ['p1', 'p2'])
})
test('creating or deleting a subtask syncs its parent', () => {
  assert.deepEqual(computeParentSyncTargets(null, t('TODO', 'p1')), ['p1'])
  assert.deepEqual(computeParentSyncTargets(t('TODO', 'p1'), null), ['p1'])
})
test('top-level tasks sync nothing', () => {
  assert.deepEqual(computeParentSyncTargets(null, t('DONE', null)), [])
})
```

- [ ] **Step 2: Run them and check they fail**

Run: `node --import tsx --test tests/project-parent-completion.test.ts`
Expected: FAIL, `computeParentSyncTargets` is not exported.

- [ ] **Step 3: Implement `computeParentSyncTargets`, then wire it in**
  - **Routes.** In each route, call `computeParentSyncTargets(before, after)`. For each target, call `syncParentTaskStatus({ parentTaskId, actorId: user.id, origin: request.nextUrl.origin })` inside its own try/catch (`console.error('Failed to sync parent task status:', …)`). Do this **before** `syncProjectCompletion`, so the project status sees the parent's new status.
  - **Response.** Collect the returned ids, load them with `PROJECT_TASK_INCLUDE`, and return them as `syncedParentTasks`. Apply `filterTasksForBacklogAccess` the same way the route already does for `task`.
  - **Workspace client.** In `patchTask`, after the existing `commitWorkspace`, merge each entry of `data.syncedParentTasks` with `updateProjectTask(value, projectId, parent.id, (task, latestProject) => normalizeTask(latestProject, parent, task))`.
  - **Per-project board.** It already refetches through `onTasksChange`, so it needs no change.

- [ ] **Step 4: Verify**
  - Run `npm test`. Expected: all pass, 0 fail.
  - Manual check on local dev (`npm run dev`, log in as `hr@example.com` / `compass-dev`):
    1. Create a project, a parent and 2 subtasks.
    2. Mark both subtasks Done. The parent moves to Done on both boards, and its activity log shows "Moved to Done automatically…".
    3. Move one subtask back. The parent returns to In Progress.
    4. Rename a subtask while the parent is manually Done. The parent stays Done.

- [ ] **Step 5: Commit**

```bash
git add app/api/projects/[id]/tasks/route.ts app/api/projects/[id]/sections/route.ts components/projects/ProjectsWorkspace.tsx lib/project-parent-completion.ts tests/project-parent-completion.test.ts
git commit -m "feat: a parent task moves to Done when all its subtasks are done, and reopens if one reopens"
```

### Task 3: Drag sections on the per-project board

**Files:**
- Modify: `app/api/projects/[id]/sections/route.ts`. Add a `PATCH` handler.
- Modify: `lib/project-status-sections.ts`. Add a pure validator.
- Modify: `components/projects/BoardView.tsx`. Make columns sortable with a handle.
- Test: `tests/project-status-sections.test.ts`

**Interfaces:**
- Produces:
  - `export function validateSectionOrder(existingIds: string[], orderedIds: unknown): string | null`. It returns an error message, or null when `orderedIds` is an array of unique strings and a permutation of `existingIds`.
  - `PATCH /api/projects/{id}/sections` takes body `{ orderedSectionIds: string[] }`. Auth is `projectAuthorizationFailure(authorization, 'manage')`. Inside one `prisma.$transaction`, set each section's `orderIndex` to its position. Respond with `{ success: true, sections }` (ordered by `orderIndex`), or 400 with the validator's message.

- [ ] **Step 1: Write the failing tests** (append to `tests/project-status-sections.test.ts`):

```ts
test('accepts a full reordering of the project sections', () => {
  assert.equal(validateSectionOrder(['a', 'b', 'c'], ['c', 'a', 'b']), null)
})
test('rejects missing, extra, duplicate or non-string ids', () => {
  assert.equal(validateSectionOrder(['a', 'b'], ['a']), 'orderedSectionIds must list every section in this project exactly once')
  assert.equal(validateSectionOrder(['a', 'b'], ['a', 'b', 'x']), 'orderedSectionIds must list every section in this project exactly once')
  assert.equal(validateSectionOrder(['a', 'b'], ['a', 'a']), 'orderedSectionIds must list every section in this project exactly once')
  assert.equal(validateSectionOrder(['a'], 'a'), 'orderedSectionIds must be an array of section IDs')
  assert.equal(validateSectionOrder(['a'], [1]), 'orderedSectionIds must be an array of section IDs')
})
```

- [ ] **Step 2: Run them and check they fail**

Run: `node --import tsx --test tests/project-status-sections.test.ts`
Expected: FAIL, `validateSectionOrder` is not exported.

- [ ] **Step 3: Implement the validator, the `PATCH` handler and the board UI**
  - **Sortable columns.** In `BoardView`:
    - Keep a `localSections` state, synced from the `sections` prop the same way `localTasks` is (`useEffect` at `:56`).
    - Wrap the columns in a `SortableContext` with `horizontalListSortingStrategy` and items `localSections.map((s) => \`section:${s.id}\`)`.
    - In `BoardColumn`, call `useSortable({ id: \`section:${section.id}\`, data: { type: 'section' }, disabled: !canManage })`, separate from the existing `useDroppable({ id: section.id })` that tasks drop onto.
    - Attach the sortable `listeners`/`attributes` only to a `GripVertical` handle button in the column header. Give it `aria-label={\`Move ${section.name} section\`}` and render it only when `canManage`.
  - **Drag handlers.**
    - In `handleDragStart`, `handleDragOver` and `handleDragEnd`, branch on `active.data.current?.type === 'section'`. A section drag never runs the task logic, and a task drag never moves sections.
    - For a section drag, pass a `collisionDetection` that filters `droppableContainers` to ids starting with `section:`.
    - On a section drop: `arrayMove`, set `localSections` optimistically, `PATCH`, then `onTasksChange()`. On error, roll back to `sections` and show `toast.error(data.error || 'Failed to reorder sections')`.

- [ ] **Step 4: Verify**
  - Run `npm test`, `npx tsc --noEmit` and `npm run lint`. Expected: all clean.
  - Manual check on local dev:
    1. Drag a column by its handle; the order persists after reload.
    2. Dragging tasks between columns still works.
    3. Keyboard: Tab to the handle, Space, Arrow keys, Space moves the column.
    4. A non-manager sees no handle.

- [ ] **Step 5: Commit**

```bash
git add app/api/projects/[id]/sections/route.ts lib/project-status-sections.ts components/projects/BoardView.tsx tests/project-status-sections.test.ts
git commit -m "feat: project leads can drag sections to reorder the board"
```

### Task 4: Click a project row to open the project

**Files:**
- Modify: `components/projects/WorkspaceTaskTable.tsx:1107` (`ProjectMatrixRow`'s `TableRow`)
- Modify: `components/projects/workspace-utils.ts`. Add a pure guard.
- Test: `tests/project-workspace-utils.test.ts`

**Interfaces:**
- Produces: `export function isRowNavigationClick(target: { closest(selector: string): unknown } | null, row: { contains(node: unknown): boolean }): boolean`. It returns false when `target` is null, when `!row.contains(target)` (the click came from portal content such as the popover or menus, whose React events still bubble to the row), or when `target.closest(ROW_INTERACTIVE_SELECTOR)` matches. Otherwise it returns true.
  - `ROW_INTERACTIVE_SELECTOR = 'a,button,input,textarea,select,label,[role="checkbox"],[role="combobox"],[role="menuitem"],[data-row-nav-ignore]'`, exported.

- [ ] **Step 1: Write the failing tests:**

```ts
const fakeTarget = (matches: boolean) => ({ closest: () => (matches ? {} : null) })
const fakeRow = (contains: boolean) => ({ contains: () => contains })

test('a click on plain row space opens the project', () => {
  assert.equal(isRowNavigationClick(fakeTarget(false), fakeRow(true)), true)
})
test('a click on a control in the row does not navigate', () => {
  assert.equal(isRowNavigationClick(fakeTarget(true), fakeRow(true)), false)
})
test('a click inside portal content does not navigate', () => {
  assert.equal(isRowNavigationClick(fakeTarget(false), fakeRow(false)), false)
})
test('no target does not navigate', () => {
  assert.equal(isRowNavigationClick(null, fakeRow(true)), false)
})
```

- [ ] **Step 2: Run them and check they fail**

Run: `node --import tsx --test tests/project-workspace-utils.test.ts`
Expected: FAIL, `isRowNavigationClick` is not exported.

- [ ] **Step 3: Implement the guard, then wire it into the row**
  - On the project `TableRow`, add `onClick={(event) => { if (isRowNavigationClick(event.target as Element, event.currentTarget)) router.push(\`/projects/${project.id}\`) }}` and `cursor-pointer`. Get `useRouter` from `next/navigation`, as `ProjectsWorkspace.tsx` does.
  - Keep the "Open project" menu item at `:1320` as the keyboard and screen-reader path.
  - For non-managers, wrap the read-only project name in a `next/link` to `/projects/${project.id}` so it's also a real link.

- [ ] **Step 4: Verify**
  - Run `npm test` and `npx tsc --noEmit`. Expected: clean.
  - Manual check: clicking empty row space or the progress cell opens the project. Clicking the checkbox, chevron, colour dot, name input (as a manager), status select or actions menu does not.

- [ ] **Step 5: Commit**

```bash
git add components/projects/WorkspaceTaskTable.tsx components/projects/workspace-utils.ts tests/project-workspace-utils.test.ts
git commit -m "feat: clicking a project's row opens the project"
```

### Task 5: Sort columns by deadline, and put "Add task" at the top

**Files:**
- Modify: `components/projects/workspace-utils.ts`. Add a sort helper next to `compareNullableString` (`:256`).
- Modify: `components/projects/BoardView.tsx:241` (column task list) and `:361-387` (move the add-task block above the `SortableContext`).
- Modify: `components/projects/WorkspaceKanban.tsx:114` (`columnItems`).
- Test: `tests/project-workspace-utils.test.ts`

**Interfaces:**
- Produces: `export function sortTasksByDeadline<T>(items: T[], getDueDate: (item: T) => string | null = (item) => (item as { dueDate: string | null }).dueDate): T[]`. It returns a new array sorted by `dateInputValue(getDueDate(item))` ascending. Tasks without a date go last, and ties keep their input order (`Array.prototype.sort` is stable).

- [ ] **Step 1: Write the failing tests:**

```ts
const d = (id: string, dueDate: string | null) => ({ id, dueDate })

test('earlier deadlines come first and undated tasks go last', () => {
  const sorted = sortTasksByDeadline([d('none', null), d('late', '2026-11-20'), d('soon', '2026-10-25')])
  assert.deepEqual(sorted.map((task) => task.id), ['soon', 'late', 'none'])
})
test('tasks with the same deadline keep their existing order', () => {
  const sorted = sortTasksByDeadline([d('b', '2026-10-25'), d('a', '2026-10-25'), d('x', null), d('y', null)])
  assert.deepEqual(sorted.map((task) => task.id), ['b', 'a', 'x', 'y'])
})
test('sorts wrapped items through the accessor', () => {
  const sorted = sortTasksByDeadline([{ task: d('late', '2026-11-20') }, { task: d('soon', '2026-10-25') }], ({ task }) => task.dueDate)
  assert.deepEqual(sorted.map(({ task }) => task.id), ['soon', 'late'])
})
test('does not mutate the input', () => {
  const input = [d('late', '2026-11-20'), d('soon', '2026-10-25')]
  sortTasksByDeadline(input)
  assert.deepEqual(input.map((task) => task.id), ['late', 'soon'])
})
```

- [ ] **Step 2: Run them and check they fail**

Run: `node --import tsx --test tests/project-workspace-utils.test.ts`
Expected: FAIL, `sortTasksByDeadline` is not exported.

- [ ] **Step 3: Implement the sort, then wire it into both boards**
  - **Board columns.**
    - BoardView: `tasks={sortTasksByDeadline(localTasks.filter((task) => task.sectionId === section.id))}`.
    - WorkspaceKanban: `sortTasksByDeadline(columnItems, ({ task }) => task.dueDate)`.
  - **Add-task position.** In `BoardColumn`, move the existing add-task block (input and button) unchanged to just above the `SortableContext`. Change its `mt-2` to `mb-2`. The cross-project board already shows its quick add at the top (`WorkspaceKanban.tsx:187`), so leave it as it is.

- [ ] **Step 4: Verify**
  - Run `npm test`, `npx tsc --noEmit` and `npm run lint`. Expected: clean.
  - Manual check: in a column with 3 tasks (due in 5 days, due tomorrow, no date), the order is tomorrow, 5 days, no date, on both boards. The "Add task" button is the first item in every per-project column, and a new task still lands in that section.

- [ ] **Step 5: Commit**

```bash
git add components/projects/workspace-utils.ts components/projects/BoardView.tsx components/projects/WorkspaceKanban.tsx tests/project-workspace-utils.test.ts
git commit -m "feat: board columns list the nearest deadline first, with Add task at the top"
```

### Task 6: Edit project priority

The migration drift was fixed in PR #31, so this task is no longer blocked.

**Files:**
- Modify: `prisma/schema.prisma` (`model Project`, `:1723`). Add `priority TaskPriority @default(MEDIUM)` after `status`.
- Create: `prisma/migrations/20261021150000_project_priority/migration.sql`, containing exactly: `ALTER TABLE "Project" ADD COLUMN "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM';`
- Modify: `app/api/projects/[id]/route.ts:62` (PUT). Accept `priority`.
- Modify: `app/api/projects/route.ts:85` (POST). Accept an optional `priority`, defaulting to MEDIUM.
- Modify: `components/projects/workspace-types.ts`. Add `priority: WorkspacePriority` to the project type and `priority?: WorkspacePriority` to `ProjectPatchRequest` (`:26`).
- Modify: `components/projects/ProjectsWorkspace.tsx:714-717`. Add `priority` to the `patchProject` merge whitelist.
- Modify: `components/projects/WorkspaceTaskTable.tsx`. In the Priority cell of `ProjectMatrixRow` (`:1295`), managers get a `Select` of LOW/MEDIUM/HIGH that calls `onPatchProject(project.id, { priority })`, styled like the row's status select. Everyone else sees the same `Badge` as now, showing `project.priority`. Remove the client-derived `highestPriority` (`:1063-1066`) if nothing else uses it.
- Test: `tests/project-task-utils.test.ts`

**Interfaces:**
- Consumes: `isProjectTaskPriority` and `PROJECT_TASK_PRIORITIES` (`lib/project-task-utils.ts:4`), which allow only LOW/MEDIUM/HIGH; `projectAuthorizationFailure(authorization, 'manage')`.
- Produces: `export function parseProjectPriority(value: unknown): TaskPriority | undefined | null` in `lib/project-task-utils.ts`. It returns `undefined` for an absent value, the value itself when `isProjectTaskPriority(value)`, and `null` when the value is invalid. On `null`, the routes return 400 `{ error: 'Invalid project priority' }`.

- [ ] **Step 1: Write the failing tests:**

```ts
test('parseProjectPriority accepts the task priorities and rejects anything else', () => {
  assert.equal(parseProjectPriority(undefined), undefined)
  assert.equal(parseProjectPriority('HIGH'), 'HIGH')
  assert.equal(parseProjectPriority('URGENT'), null)
  assert.equal(parseProjectPriority('high'), null)
  assert.equal(parseProjectPriority(3), null)
})
```

- [ ] **Step 2: Run them and check they fail**

Run: `node --import tsx --test tests/project-task-utils.test.ts`
Expected: FAIL, `parseProjectPriority` is not exported.

- [ ] **Step 3: Implement the schema change, migration, parser, routes, types and UI as listed above.**
  - Run `npx prisma generate`, then apply the migration locally with `npx prisma migrate deploy`. `DATABASE_URL` must be the local `localhost:5433` DB.

- [ ] **Step 4: Verify**
  - Check the migration matches the schema: `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url postgresql://compass:compass@localhost:5433/compass_weekly_test --exit-code`. It must exit 0.
  - Run `npm test`, `npx tsc --noEmit` and `npm run lint`. Expected: clean.
  - Manual check:
    1. As `hr@example.com`, change a project's priority in the `/projects` table; it persists after reload.
    2. As `employee1@example.com` (not a manager), the priority shows read-only.
    3. Sending `PUT` with `{ priority: 'URGENT' }` returns 400.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261021150000_project_priority lib/project-task-utils.ts app/api/projects/route.ts app/api/projects/[id]/route.ts components/projects/workspace-types.ts components/projects/ProjectsWorkspace.tsx components/projects/WorkspaceTaskTable.tsx tests/project-task-utils.test.ts
git commit -m "feat: project leads can set a project's priority"
```

### Task 7: Shareable task links (ticket `cmvi7zpf900013ny19m2et72b`)

**Files:**
- Modify: `lib/project-task-utils.ts`. Add two URL helpers.
- Modify: `app/(evaluator)/projects/[id]/page.tsx`.
  - After `loadProject` (`:93`) succeeds, read `?task=` with `useSearchParams` and open that task (top-level or subtask) with the existing `setSelectedTask` + `setPanelOpen(true)`.
  - When the panel opens or changes task, `router.replace` the URL to include `?task=<id>`. When it closes (`:703`), remove the parameter. Use `{ scroll: false }`.
  - If the id doesn't match a loaded task, show `toast.error('That task no longer exists or you do not have access to it')` and remove the parameter.
- Modify: `components/projects/TaskDetailPanel.tsx`. Add a "Copy link" icon button (`Link2` from lucide-react, `aria-label="Copy link to this task"`) in the panel header. It calls `navigator.clipboard.writeText(buildTaskShareUrl(window.location.origin, projectId, task.id))`, then `toast.success('Link copied')`, or `toast.error('Could not copy the link')` if that throws.
- Test: `tests/project-task-utils.test.ts`

**Interfaces:**
- Produces:
  - `export function buildTaskShareUrl(origin: string, projectId: string, taskId: string): string`. It returns `${origin}/projects/${encodeURIComponent(projectId)}?task=${encodeURIComponent(taskId)}`.
  - `export function readSharedTaskId(params: { get(name: string): string | null }): string | null`. It returns the trimmed `task` value, or null when the value is empty or longer than 64 characters.

- [ ] **Step 1: Write the failing tests:**

```ts
test('buildTaskShareUrl links to the project page with the task open', () => {
  assert.equal(buildTaskShareUrl('https://compass.example', 'p1', 't1'), 'https://compass.example/projects/p1?task=t1')
  assert.equal(buildTaskShareUrl('https://c.example', 'p 1', 't/1'), 'https://c.example/projects/p%201?task=t%2F1')
})
test('readSharedTaskId returns a usable id or null', () => {
  assert.equal(readSharedTaskId(new URLSearchParams('task=abc')), 'abc')
  assert.equal(readSharedTaskId(new URLSearchParams('task=%20abc%20')), 'abc')
  assert.equal(readSharedTaskId(new URLSearchParams('')), null)
  assert.equal(readSharedTaskId(new URLSearchParams('task=')), null)
  assert.equal(readSharedTaskId(new URLSearchParams(`task=${'x'.repeat(65)}`)), null)
})
```

- [ ] **Step 2: Run them and check they fail**

Run: `node --import tsx --test tests/project-task-utils.test.ts`
Expected: FAIL, the helpers are not exported.

- [ ] **Step 3: Implement the helpers, then wire them into the page and the panel as listed above.**

- [ ] **Step 4: Verify**
  - Run `npm test`, `npx tsc --noEmit` and `npm run lint`. Expected: clean.
  - Manual check:
    1. Open a task; the URL gains `?task=`.
    2. Copy link, then open it in a new tab; the same task panel opens. A subtask link works too.
    3. Close the panel; the parameter is removed.
    4. A made-up id shows the error toast.
    5. Logged out, the link goes to `/login` and returns to the task after login (the middleware keeps `next` with its query).

- [ ] **Step 5: Commit**

```bash
git add lib/project-task-utils.ts "app/(evaluator)/projects/[id]/page.tsx" components/projects/TaskDetailPanel.tsx tests/project-task-utils.test.ts
git commit -m "feat: every task has a shareable link that opens it directly"
```

### Task 7b: Polish shareable links (copy feedback + no-access screen)

Added on 2026-10-22 at the user's request: "it should be professional". Links stay private: only logged-in people with project access can open them.

**Files:**
- Modify: `components/projects/TaskDetailPanel.tsx`. The Copy link button (search `Copy link to this task`).
- Modify: `app/(evaluator)/projects/[id]/page.tsx`. `loadProject` and the `if (!project) return <EmptyState …>` branch.
- Modify: `lib/project-task-utils.ts`. Add a pure helper.
- Test: `tests/project-task-utils.test.ts`

**Interfaces:**
- Produces: `export function projectLoadFailure(status: number): 'forbidden' | 'not_found' | 'error'`. It maps 403 to `'forbidden'`, 404 to `'not_found'`, and anything else to `'error'`.
- **Copy feedback.**
  - After a successful copy, the button shows a `Check` icon (lucide) instead of `Link2` for 2000 ms, then switches back.
  - While it shows `Check`, `title` and the visible tooltip read "Link copied". Add `aria-live="polite"` text for screen readers: an `sr-only` span that says "Link copied".
  - Keep the `toast.success('Link copied')`.
  - Clear the timer on unmount and when the panel's task changes, so the check never carries over to another task.
- **No-access screen.**
  - `loadProject` records `projectLoadFailure(res.status)` when `!res.ok`.
  - The `!project` branch renders the existing `EmptyState` with, per failure:
    - `'forbidden'`: icon `Lock`, title "You don't have access to this project", description "Ask a project lead to add you, then open the link again."
    - `'not_found'`: icon `ListTodo`, title "Project not found", description "It may have been deleted, or the link is incomplete."
    - `'error'`: icon `ListTodo`, title "Couldn't load this project", description "Check your connection and try again." Add a "Try again" button that re-runs `loadProject`.
  - All three get an `action` button "Back to Projects" that links to `/projects` (use the existing `Button` + `next/link`, as other pages do).
  - A missing task inside a project the viewer *can* open keeps the existing toast.

- [ ] **Step 1: Write the failing test:**

```ts
test('projectLoadFailure names the reason a project could not be opened', () => {
  assert.equal(projectLoadFailure(403), 'forbidden')
  assert.equal(projectLoadFailure(404), 'not_found')
  assert.equal(projectLoadFailure(500), 'error')
  assert.equal(projectLoadFailure(401), 'error')
})
```

- [ ] **Step 2: Run it and check it fails.** Run: `node --import tsx --test tests/project-task-utils.test.ts`. Expected: FAIL, the helper is not exported.
- [ ] **Step 3: Implement the helper, the copy feedback and the no-access screen as listed above.**
- [ ] **Step 4: Verify.**
  - Run `npm test` and `npx tsc --noEmit`.
  - curl: as employee4@example.com (not a member of "Demo: Client portal relaunch"), `GET /api/projects/<id>` returns 403. That is the status the page maps to the access screen.
  - UI checks for the human:
    1. Click Copy link; the icon turns into a check for about 2 s.
    2. Open a project link as a non-member; you see the "You don't have access" screen with "Back to Projects".
    3. A made-up project id shows "Project not found".
- [ ] **Step 5: Commit** with `git commit -m "feat: copy-link confirmation and a clear screen when a project link can't be opened"`, staging only the four files by path.

### Task 8: Assignees and co-assignees can manage co-assignees (ticket `cmvi7zq3l00073ny13vre55ul`)

**Files:**
- Modify: `lib/project-access.ts`. Add a rule function.
- Modify: `app/api/projects/[id]/tasks/route.ts:506-508` (PUT). Replace the `!authorization.canManage` co-assignee check with the new rule. Leave the POST check (`:254`) unchanged: only managers set co-assignees when creating a task.
- Modify: `components/projects/TaskDetailPanel.tsx:921`. Show the co-assignee `Dropdown` when `canEditCoAssignees` is true, not only when `canManage && canEdit`. When `availableAssistantMembers` is empty, keep the existing "No other project members available." text and add "Ask a project lead to add people to this project."
- Test: `tests/project-access.test.ts`

**Interfaces:**
- Produces: `export function canEditTaskCoAssignees(input: { viewerId: string; assigneeId: string | null; assistantIds: string[]; canManage: boolean }): boolean`. It returns `canManage || assigneeId === viewerId || assistantIds.includes(viewerId)`, the same inputs as `canEditAssignedProjectTask` (`:46`).
- Existing limits stay as they are: `validateProjectMemberIds` restricts co-assignees to project members, and the assignee is filtered out of assistants (`route.ts:528`).

- [ ] **Step 1: Write the failing tests:**

```ts
const base = { viewerId: 'me', assigneeId: 'other', assistantIds: [] as string[], canManage: false }
test('the assignee can manage co-assignees', () => {
  assert.equal(canEditTaskCoAssignees({ ...base, assigneeId: 'me' }), true)
})
test('an existing co-assignee can manage co-assignees', () => {
  assert.equal(canEditTaskCoAssignees({ ...base, assistantIds: ['me'] }), true)
})
test('a project lead or HR can manage co-assignees', () => {
  assert.equal(canEditTaskCoAssignees({ ...base, canManage: true }), true)
})
test('other project members cannot', () => {
  assert.equal(canEditTaskCoAssignees(base), false)
  assert.equal(canEditTaskCoAssignees({ ...base, assigneeId: null }), false)
})
```

- [ ] **Step 2: Run them and check they fail**

Run: `node --import tsx --test tests/project-access.test.ts`
Expected: FAIL, `canEditTaskCoAssignees` is not exported.

- [ ] **Step 3: Implement the rule, then use it in the PUT route and the panel as listed above.**
  - In the panel, compute it from `viewerId`, `task.assigneeId`, `task.assistants` and `canManage`.

- [ ] **Step 4: Verify**
  - Run `npm test`, `npx tsc --noEmit` and `npm run lint`. Expected: clean.
  - Manual check:
    1. As `employee1@example.com` (assignee of "Login page redesign" in the demo seed), add and remove a co-assignee.
    2. As co-assignee `employee2@example.com`, add another member.
    3. As `employee3@example.com` on a task that isn't theirs, the field is read-only, and a direct `PUT` with `assistantIds` returns 403 (blocked earlier by `canEditAssignedProjectTask`).

- [ ] **Step 5: Commit**

```bash
git add lib/project-access.ts app/api/projects/[id]/tasks/route.ts components/projects/TaskDetailPanel.tsx tests/project-access.test.ts
git commit -m "fix: a task's assignee and co-assignees can manage its co-assignees"
```

### Task 9: Search bar in assignee dropdowns (ticket `cmvj9ip2y0001hmcgbj0a9nqi`)

The ticket asks for a search bar in the dropdown that opens when picking assignees for any task, in every view of a task (table, card, panel). Co-assignee pickers count too, because they are the same kind of person picker.

**Files:**
- Modify: `components/projects/workspace-utils.ts`. Add a pure filter.
- Modify every person picker for a task's assignee or co-assignees. Find them by searching for `Unassigned`, `assignee` and `members.map` in:
  - `components/projects/TaskDetailPanel.tsx`: the assignee field and the co-assignee `Dropdown` (Task 8 widened who sees it).
  - `components/projects/WorkspaceTaskTable.tsx`: `AssigneeCell` (`:1933`), plus any other assignee `Select`/menu in that file.
  - `components/projects/WorkspaceBulkActions.tsx`: the bulk "assign" picker.
  - `components/projects/WorkspaceKanban.tsx`: only if it has its own assignee picker.
- Test: `tests/project-workspace-utils.test.ts`

**Interfaces:**
- Produces: `export function filterPeopleByQuery<T extends { name: string; email?: string | null }>(people: T[], query: string): T[]`.
  - It trims the query. An empty query returns `people` unchanged.
  - Otherwise it keeps people whose `name` or `email` contains the query, case-insensitively and ignoring accents (`normalize('NFD')`, strip combining marks). Input order is kept.
- UI rule for every picker:
  - A text input at the top of the dropdown, `placeholder="Search people"`, `aria-label="Search people"`. It is focused when the dropdown opens and cleared when it closes.
  - The list shows `filterPeopleByQuery(options, query)`. Options like "Unassigned" or "Clear co-assignees" stay visible and are not filtered.
  - When nothing matches, show "No people match" in the same muted style as "No other project members available.".
  - Typing in the input must not close the dropdown or trigger the menu's typeahead: stop key events from propagating, as `TaskDetailPanel.tsx`'s co-assignee list already does with `stopPropagation`.
  - Where a picker is a Radix `Select`, which cannot hold an input, replace it with the `Popover` + button list pattern already used in `WorkspaceTaskTable.tsx`, keeping the same trigger look.

- [ ] **Step 1: Write the failing tests:**

```ts
const people = [
  { id: '1', name: 'Fakayha Jamil', email: 'fakayha@plutus21.com' },
  { id: '2', name: 'Amjad Ali', email: 'amjad@plutus21.com' },
  { id: '3', name: 'José Núñez', email: null },
]
test('an empty or blank query keeps everyone in order', () => {
  assert.deepEqual(filterPeopleByQuery(people, '').map((p) => p.id), ['1', '2', '3'])
  assert.deepEqual(filterPeopleByQuery(people, '   ').map((p) => p.id), ['1', '2', '3'])
})
test('matches part of a name, ignoring case', () => {
  assert.deepEqual(filterPeopleByQuery(people, 'ALI').map((p) => p.id), ['2'])
})
test('matches by email', () => {
  assert.deepEqual(filterPeopleByQuery(people, 'fakayha@').map((p) => p.id), ['1'])
})
test('ignores accents', () => {
  assert.deepEqual(filterPeopleByQuery(people, 'jose nunez').map((p) => p.id), ['3'])
})
test('no match returns an empty list', () => {
  assert.deepEqual(filterPeopleByQuery(people, 'zzz'), [])
})
```

- [ ] **Step 2: Run them and check they fail**

Run: `node --import tsx --test tests/project-workspace-utils.test.ts`
Expected: FAIL, `filterPeopleByQuery` is not exported.

- [ ] **Step 3: Implement the filter, then add the search input to every picker listed above.** In the report, list each picker you changed (file:line) and any you found but left alone, with the reason.

- [ ] **Step 4: Verify**
  - Run `npm test` and `npx tsc --noEmit`. Expected: clean.
  - UI checks for the human:
    1. In the table, card and panel views, open an assignee picker and type part of a name; the list narrows and "No people match" shows when it's empty.
    2. Pick a person; it saves as before.
    3. The bulk assign picker and the co-assignee picker behave the same way.
    4. Keyboard: the input has focus on open, and Escape closes the picker.

- [ ] **Step 5: Commit**

```bash
git add components/projects/workspace-utils.ts components/projects/TaskDetailPanel.tsx components/projects/WorkspaceTaskTable.tsx components/projects/WorkspaceBulkActions.tsx tests/project-workspace-utils.test.ts
git commit -m "feat: search people in every assignee picker"
```

### Finishing

- [ ] Run `npm test`, `npm run test:weekly-db` (see memory "Compass local dev"), `npx tsc --noEmit`, `npm run lint` and `npm run build`. Point `DATABASE_URL` at the local DB only; the build runs `prisma migrate deploy`.
- [ ] Use superpowers:requesting-code-review, then superpowers:finishing-a-development-branch. Open the PR to `Data-Quant/compass`.
- [ ] Draft the Compass ticket updates (cause, fix, PR link). Show them to Amjad **before** posting, then move the tickets to "Under Testing".

## Out of scope: Sprint Division (`cmv5742j8003b8b2j2k99kyb0`)

Compass has no sprint concept, so this ticket needs its own spec (superpowers:brainstorming). Questions for the ticket author:
1. Are sprints per project, or shared across projects?
2. Do sprints have a fixed length, and who creates them (PM only)?
3. What happens to unfinished tasks when a sprint ends: carry over automatically, or move by hand?
4. Should the dropdown filter the per-project board, the cross-project board, or both? What does "All" show?
5. Can a task be in no sprint (backlog), and can it be in only one sprint at a time?
