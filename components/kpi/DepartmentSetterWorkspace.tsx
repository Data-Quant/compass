'use client'

import { DepartmentKpisPanel } from './DepartmentKpisPanel'

export function DepartmentSetterWorkspace() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 sm:p-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Department KPIs</h1>
        <p className="mt-1 text-muted-foreground">
          {'Set each department\u2019s monthly KPIs for its leads and JPs. Owners claim them at month end and the Execution team verifies them.'}
        </p>
      </div>
      <DepartmentKpisPanel allowPicker />
    </div>
  )
}
