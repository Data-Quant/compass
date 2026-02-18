'use client'

import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CalendarDays, FileText, LayoutGrid, List, PieChart } from 'lucide-react'

interface MyTasksTabsProps {
  value: string
}

export function MyTasksTabs({ value }: MyTasksTabsProps) {
  return (
    <TabsList className="h-10 gap-1 bg-muted/60 p-1">
      <TabsTrigger value="list" className="gap-1.5 text-xs sm:text-sm">
        <List className="w-3.5 h-3.5" />
        List
      </TabsTrigger>
      <TabsTrigger value="board" className="gap-1.5 text-xs sm:text-sm">
        <LayoutGrid className="w-3.5 h-3.5" />
        Board
      </TabsTrigger>
      <TabsTrigger value="calendar" className="gap-1.5 text-xs sm:text-sm">
        <CalendarDays className="w-3.5 h-3.5" />
        Calendar
      </TabsTrigger>
      <TabsTrigger value="dashboard" className="gap-1.5 text-xs sm:text-sm">
        <PieChart className="w-3.5 h-3.5" />
        Dashboard
      </TabsTrigger>
      <TabsTrigger value="files" className="gap-1.5 text-xs sm:text-sm">
        <FileText className="w-3.5 h-3.5" />
        Files
      </TabsTrigger>
    </TabsList>
  )
}
