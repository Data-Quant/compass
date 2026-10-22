# PM UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the per-project board, the overall board, the projects table and the project list look professional and consistent, without changing behavior.

**Architecture:** Extract a shared `TaskCard` and a shared `BoardColumn` shell used by both boards. Restyle the table and list rows in place. Pure helpers (due state, priority icon, date formatting) live in `workspace-utils.ts` and are unit-tested.

**Tech Stack:** Next.js 16, React 18, Tailwind 3.4, shadcn/Radix, lucide-react, node:test via tsx.

**Spec:** `.superpowers/ui-polish/design-spec.md`. This is binding, including section 9 (the user's decisions). Mockup: https://claude.ai/artifact/K5fKCXMLX5tg5o8qRhkoM7

## Global Constraints
- Visual and layout only. Same fetches, payloads, permissions, toasts, DnD semantics and aria names (spec section 6), except the one new behavior in spec 9: Add task on every overall-board column.
- Use the existing tokens, fonts and components only. Do not edit any `components/ui/*` file.
- No em dashes ("—") in UI copy, and no new "A · B" strings.
- No new npm dependencies.
- Node 22 for tests (`export PATH=~/.nvm/versions/node/v22.23.3/bin:$PATH`). Each task passes `npm test` and `npx tsc --noEmit`.
- Commit on `feat/pm-ui-polish` only. Never push.

## Review Focus
1. A card is still clickable and draggable on both boards after the TaskCard swap. Overall: handle drag. Per-project: whole-card drag.
2. Section drag (per-project, canManage) still works with the new column shell, and the remove-section button still works.
3. The table's row-click navigation still ignores the new Status/Priority triggers and the name control (`isRowNavigationClick`).
4. The List view's complete toggle still maps to the same section/status update, and select still feeds bulk actions.
5. The overall-board Add task creates a task in the right project and section for each column, and Backlog keeps its old rules.

---

### Task 1: Shared primitives
Spec section 8 slice 1, plus sections 2 (due states) and 4 (`PRIORITY_ICON`).
**Files:** `components/projects/workspace-utils.ts`, `components/composed/UserAvatar.tsx` (optional `title` prop), new `components/projects/PriorityPill.tsx`, new `components/projects/PeopleStack.tsx`, `components/projects/TaskDetailPanel.tsx` (import the moved `toLocalDateValue` only), `tests/project-workspace-utils.test.ts`.
**Produces:** `dueState(dueDate: string | null, opts: { done: boolean; overdue: boolean; now?: Date }): { kind: 'none'|'normal'|'soon'|'overdue'|'done'; label: string; lateLabel?: string; title: string }`, `formatShortDue(value: string, now?: Date): string`, `PRIORITY_ICON`, `toLocalDateValue` (moved), `<PriorityPill priority editable? onChange? disabled?>`, `<PeopleStack assignee assistants size="sm"|"md" showFirstName?>`.
- [ ] Tests first for `dueState` and `formatShortDue`: no date gives "No date"; more than 2 days out is normal ("Oct 24"); 0 is "Today", 1 is "Tomorrow", 2 days is soon; overdue gives `lateLabel` "2d late"; done is never overdue; a different year appends the year. Run, see them fail, implement, see them pass.
- [ ] Build `PriorityPill` and `PeopleStack` per spec sections 2 and 4 (tooltip roles, cap 2 or 3 then +N, dashed Unassigned).
- [ ] `npm test`, `npx tsc --noEmit`, commit `feat: shared due-date, priority and people pieces for the project views`.

### Task 2: Shared TaskCard on both boards
Spec section 2 and slice 2.
**Files:** new `components/projects/TaskCard.tsx`, `components/projects/BoardView.tsx`, `components/projects/WorkspaceKanban.tsx`.
- [ ] Build `TaskCard` with the exact props and anatomy from spec section 2, using Task 1's pieces.
- [ ] Swap it into both boards. Keep each board's DnD wrapper. Use the stretched-button click. Remove BoardView's nested button, `PRIORITY_DOT` and the formatter.
- [ ] Add a render test with `renderToStaticMarkup` (as `tests/project-workspace-matrix.test.ts` does). Assert the card shows the assignee's first name, a co-assignee avatar with title "Co-assignee: …", "No date" when the date is missing, and the "2d late" text when overdue.
- [ ] Tests and tsc, then commit `feat: one task card for both boards with assignee, co-assignees and deadline`.

### Task 3: Shared column, scroll, page width, Add task on every overall column
Spec section 3 and section 9 (overall Add task).
**Files:** new `components/projects/BoardColumn.tsx` (with `useScrollEdge`), `components/projects/BoardView.tsx`, `components/projects/WorkspaceKanban.tsx`, `components/projects/ProjectsWorkspace.tsx` (`createActiveTask` column param, wiring), `app/(evaluator)/projects/[id]/page.tsx` (container `max-w-[1600px]`).
- [ ] Column shell per spec: 288px, neutral body, one-line header with the subtitle as a tooltip, drop highlight, scroll fade.
- [ ] Per-project board: keep the section sortable and grip, and the Add task at top.
- [ ] Overall board: Add task button at the top of all 4 columns, opening the composer (title, project Select, Add). Backlog goes through `quickAdd`. The others go through `createActiveTask(..., column)`.
- [ ] Unit test: extract the target-section choice as a pure `targetSectionForNewTask(project, column, parentTask?)` in workspace-utils.ts and test it for TODO, IN_PROGRESS, DONE and the parent case.
- [ ] Tests and tsc, then commit `feat: one column design for both boards, full-width project board, add task in every column`.

### Task 4: Projects table restyle
Spec section 4, slice 4, plus section 9 (name fully visible).
**Files:** `components/projects/WorkspaceTaskTable.tsx` (header, `ProjectMatrixRow`, `ProjectActions` column, `InlineProjectRow`, BacklogGroup header).
- [ ] Apply the new column order and controls (Status column, progress bar "x of y", `PriorityPill`, hover-only actions, no left edge, square checkbox). The Project column gets `min-w-[360px]` and wraps the name to 2 lines.
- [ ] Keep `tests/project-workspace-matrix.test.ts` passing. Update its selectors only where the markup legitimately moved, and say which.
- [ ] Tests and tsc, then commit `feat: cleaner projects table`.

### Task 5: List rows restyle
Spec section 5 and slice 5.
**Files:** new `components/projects/DueDatePicker.tsx`, `components/projects/WorkspaceTaskTable.tsx` (`OpenedProjectTaskTable`, `WorkspacePopupTaskRows`, `WorkspacePopupTaskRow`, `InlineSubtaskComposerRow` placement, `TaskAssignees` summary, the date inputs in `PersonTaskRow` and `BacklogGroup`), `components/projects/ListView.tsx`.
- [ ] `DueDatePicker` replaces every native date input. Rows are single-line at 40px. Select (square, hover) and complete (round toggle) are distinct. "New subtask" shows only under expanded parents, plus the hover "+".
- [ ] Tests and tsc, then commit `feat: cleaner task list rows`.

### Task 6: Copy sweep and final checks
Spec slice 6.
- [ ] Remove the listed "·" strings, use "…" in placeholders, and grep that there is no "—" in components/projects or app/(evaluator)/projects.
- [ ] Run `npm test`, `npx tsc --noEmit` and `npx next build`. Commit `chore: copy sweep for the project views`.
