'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { RELATIONSHIP_TYPE_LABELS, RelationshipType } from '@/types'
import { PageHeader } from '@/components/layout/page-header'
import { PageFooter } from '@/components/layout/page-footer'
import { PageContainer, PageContent } from '@/components/layout/page-container'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, FileText, Download, Eye } from 'lucide-react'

function ReportsPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const periodId = searchParams.get('periodId') || 'active'
  const [reports, setReports] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<any>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'score'>('name')
  const [anonymize, setAnonymize] = useState(false)

  useEffect(() => {
    checkAuth()
  }, [periodId])

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/session')
      const data = await res.json()
      if (!data.user || data.user.role !== 'HR') {
        router.push('/login')
        return
      }
      loadReports()
    } catch (error) {
      router.push('/login')
    }
  }

  const loadReports = async () => {
    try {
      // Single bulk endpoint instead of 40+ sequential requests
      const response = await fetch(`/api/reports/bulk?periodId=${periodId}`)
      const data = await response.json()

      if (data.error) {
        toast.error(data.error)
        return
      }

      setPeriod(data.period)
      setReports(data.reports || [])
    } catch (error) {
      toast.error('Failed to load reports')
    } finally {
      setLoading(false)
    }
  }

  const handleViewPDF = (employeeId: string) => {
    const url = `/api/reports?employeeId=${employeeId}&periodId=${periodId}&format=html${anonymize ? '&anonymize=true' : ''}`
    window.open(url, '_blank')
  }

  const handleDownloadPDF = (employeeId: string, employeeName: string) => {
    const url = `/api/reports?employeeId=${employeeId}&periodId=${periodId}&format=html${anonymize ? '&anonymize=true' : ''}`
    const printWindow = window.open(url, '_blank')
    if (printWindow) {
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print()
        }, 500)
      }
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-600 dark:text-emerald-400'
    if (score >= 60) return 'text-amber-600 dark:text-amber-400'
    return 'text-red-600 dark:text-red-400'
  }

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'bg-emerald-500'
    if (score >= 60) return 'bg-amber-500'
    return 'bg-red-500'
  }

  const filteredReports = reports
    .filter(r =>
      r.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.employee?.department?.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .sort((a, b) => {
      if (sortBy === 'score') return b.overallScore - a.overallScore
      return a.employeeName.localeCompare(b.employeeName)
    })

  if (loading) {
    return (
      <PageContainer>
        <LoadingScreen message="Loading reports..." />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader backHref="/admin" backLabel="Back to Admin" badge="Reports" />

      <PageContent>
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground font-display">Performance Reports</h1>
            {period && (
              <p className="text-muted-foreground mt-1">
                {period.name} • {new Date(period.startDate).toLocaleDateString()} - {new Date(period.endDate).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6"
        >
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-4 items-center">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="Search by name or department..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as 'name' | 'score')}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="name">Sort by Name</SelectItem>
                    <SelectItem value="score">Sort by Score</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="anonymize"
                    checked={anonymize}
                    onCheckedChange={(checked) => setAnonymize(checked === true)}
                  />
                  <Label htmlFor="anonymize" className="text-sm text-foreground cursor-pointer">
                    Anonymize
                  </Label>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Reports Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredReports.map((report, index) => (
            <motion.div
              key={report.employeeId}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * index }}
            >
              <Card className="hover:shadow-lg transition-shadow duration-300">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-medium">
                        {report.employeeName.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                      </div>
                      <div>
                        <h3 className="font-semibold text-foreground">{report.employeeName}</h3>
                        {report.employee?.department && (
                          <p className="text-sm text-muted-foreground">{report.employee.department}</p>
                        )}
                      </div>
                    </div>
                    <div className={`text-2xl font-bold ${getScoreColor(report.overallScore)}`}>
                      {report.overallScore?.toFixed(1) || '0.0'}%
                    </div>
                  </div>

                  {/* Score Bar */}
                  <div className="mb-4">
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${getScoreBg(report.overallScore)}`}
                        style={{ width: `${Math.min(report.overallScore, 100)}%` }}
                      />
                    </div>
                  </div>

                  {report.breakdown && report.breakdown.length > 0 && (
                    <div className="space-y-2 mb-4 pt-4 border-t border-border">
                      {report.breakdown.slice(0, 3).map((b: any) => (
                        <div key={b.relationshipType} className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            {RELATIONSHIP_TYPE_LABELS[b.relationshipType as RelationshipType] || b.relationshipType}
                          </span>
                          <span className="font-medium text-foreground">{b.normalizedScore?.toFixed(2) || '0.00'}/4.0</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {(!report.breakdown || report.breakdown.length === 0) && (
                    <div className="py-4 border-t border-border">
                      <p className="text-sm text-muted-foreground text-center">No evaluations yet</p>
                    </div>
                  )}

                  <div className="flex gap-2 mt-4">
                    <Button
                      variant="default"
                      className="flex-1"
                      onClick={() => handleViewPDF(report.employeeId)}
                    >
                      <Eye className="w-4 h-4" />
                      View
                    </Button>
                    <Button
                      variant="default"
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => handleDownloadPDF(report.employeeId, report.employeeName)}
                    >
                      <Download className="w-4 h-4" />
                      PDF
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {filteredReports.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Card>
              <CardContent className="p-12 text-center">
                <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No reports found matching your criteria.</p>
              </CardContent>
            </Card>
          </motion.div>
        )}

        <p className="mt-6 text-sm text-muted-foreground text-center">
          Showing {filteredReports.length} of {reports.length} reports
        </p>

        <PageFooter />
      </PageContent>
    </PageContainer>
  )
}

export default function ReportsPage() {
  return (
    <Suspense fallback={
      <PageContainer>
        <LoadingScreen message="Loading reports..." />
      </PageContainer>
    }>
      <ReportsPageContent />
    </Suspense>
  )
}

