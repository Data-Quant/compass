'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AlertCircle } from 'lucide-react'
import { OverviewTab } from '@/components/analytics/OverviewTab'
import { TrendsTab } from '@/components/analytics/TrendsTab'
import { CalibrationTab } from '@/components/analytics/CalibrationTab'
import type { Analytics, InsightsPayload } from '@/components/analytics/types'

export default function AnalyticsPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null)
  const [insights, setInsights] = useState<InsightsPayload | null>(null)
  const [periodId, setPeriodId] = useState<string>('active')
  const [loading, setLoading] = useState(true)
  const [namesById, setNamesById] = useState<Record<string, string>>({})

  const loadData = useCallback(async (selectedPeriodId: string) => {
    setLoading(true)
    try {
      const query = selectedPeriodId === 'active' ? '' : `?periodId=${selectedPeriodId}`
      const [analyticsRes, insightsRes] = await Promise.all([
        fetch(`/api/admin/analytics${query}`),
        fetch(`/api/admin/analytics/insights${query}`),
      ])
      const [analyticsData, insightsData] = await Promise.all([
        analyticsRes.json(),
        insightsRes.json(),
      ])

      if (analyticsData.error) {
        toast.error(analyticsData.error)
      } else {
        setAnalytics(analyticsData)
      }

      if (insightsData.error) {
        toast.error(insightsData.error)
      } else {
        setInsights(insightsData)
      }
    } catch (error) {
      toast.error('Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData(periodId)
  }, [loadData, periodId])

  useEffect(() => {
    let cancelled = false
    // GET /api/users responds with { users: [{ id, name, department, position }] }.
    fetch('/api/users')
      .then((res) => res.json())
      .then((data: { users?: Array<{ id?: string; name?: string }> }) => {
        if (cancelled || !Array.isArray(data.users)) return
        const entries: Record<string, string> = {}
        for (const entry of data.users) {
          if (entry.id && entry.name) entries[entry.id] = entry.name
        }
        setNamesById(entries)
      })
      .catch(() => {
        // Names are cosmetic; the views fall back to the id.
      })
    return () => {
      cancelled = true
    }
  }, [])

  const resolveName = useCallback(
    (employeeId: string) => namesById[employeeId] || employeeId,
    [namesById]
  )

  if (loading) {
    return (
      <div className="p-6 sm:p-8 max-w-7xl mx-auto">
        <LoadingScreen message="Loading analytics..." />
      </div>
    )
  }

  if (!analytics) {
    return (
      <div className="p-6 sm:p-8 max-w-7xl mx-auto">
        <Card>
          <CardContent className="p-12 text-center">
            <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No analytics data available.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground font-display">Analytics Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            {analytics.period.name} • {new Date(analytics.period.startDate).toLocaleDateString()} -{' '}
            {new Date(analytics.period.endDate).toLocaleDateString()}
          </p>
        </div>

        {insights && insights.periods.length > 0 && (
          <Select value={periodId} onValueChange={setPeriodId}>
            <SelectTrigger className="w-full sm:w-[220px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active period</SelectItem>
              {insights.periods.map((period) => (
                <SelectItem key={period.id} value={period.id}>
                  {period.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="talent">Talent Grid</TabsTrigger>
          <TabsTrigger value="blindspots">Blind Spots</TabsTrigger>
          <TabsTrigger value="calibration">Calibration</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab analytics={analytics} />
        </TabsContent>
        <TabsContent value="trends">
          {insights ? (
            <TrendsTab trends={insights.trends} resolveName={resolveName} />
          ) : (
            <div className="text-muted-foreground">No insight data available.</div>
          )}
        </TabsContent>
        <TabsContent value="talent">
          <div className="text-muted-foreground">Talent Grid arrives in a later task.</div>
        </TabsContent>
        <TabsContent value="blindspots">
          <div className="text-muted-foreground">Blind Spots arrives in a later task.</div>
        </TabsContent>
        <TabsContent value="calibration">
          {insights ? (
            <CalibrationTab calibration={insights.calibration} resolveName={resolveName} />
          ) : (
            <div className="text-muted-foreground">No insight data available.</div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
