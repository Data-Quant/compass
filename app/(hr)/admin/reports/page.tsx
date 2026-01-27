'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { RELATIONSHIP_TYPE_LABELS, RelationshipType } from '@/types'
import { PageHeader } from '@/components/layout/page-header'
import { PageFooter } from '@/components/layout/page-footer'
import { PageContainer, PageContent } from '@/components/layout/page-container'
import { Search, FileText, Download, Eye, Filter } from 'lucide-react'

export default function ReportsPage() {
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
      const periodResponse = await fetch('/api/evaluations/dashboard?periodId=' + periodId)
      const periodData = await periodResponse.json()
      setPeriod(periodData.period)

      const employeesResponse = await fetch('/api/auth/login')
      const employeesData = await employeesResponse.json()
      const employeeList = employeesData.users?.filter((u: any) => u.role !== 'HR') || []

      const reportsList = []
      for (const employee of employeeList) {
        try {
          const response = await fetch(`/api/reports?employeeId=${employee.id}&periodId=${periodId}`)
          const data = await response.json()
          if (data.report) {
            reportsList.push({ ...data.report, employee })
          } else {
            reportsList.push({
              employeeId: employee.id,
              employeeName: employee.name,
              overallScore: 0,
              breakdown: [],
              employee,
            })
          }
        } catch (error) {
          reportsList.push({
            employeeId: employee.id,
            employeeName: employee.name,
            overallScore: 0,
            breakdown: [],
            employee,
          })
        }
      }
      setReports(reportsList)
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
        <div className="min-h-screen flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-4"
          >
            <div className="w-12 h-12 rounded-full gradient-primary animate-pulse" />
            <p className="text-muted text-sm">Loading reports...</p>
          </motion.div>
        </div>
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
            <h1 className="text-2xl font-bold text-foreground">Performance Reports</h1>
            {period && (
              <p className="text-muted mt-1">
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
          className="glass rounded-xl p-4 mb-6"
        >
          <div className="flex flex-wrap gap-4 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <input
                type="text"
                placeholder="Search by name or department..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-surface border border-border rounded-lg text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'name' | 'score')}
              className="px-4 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            >
              <option value="name">Sort by Name</option>
              <option value="score">Sort by Score</option>
            </select>
            <label className="flex items-center gap-2 px-4 py-2 bg-surface border border-border rounded-lg cursor-pointer hover:bg-surface/80 transition-colors">
              <input
                type="checkbox"
                checked={anonymize}
                onChange={(e) => setAnonymize(e.target.checked)}
                className="w-4 h-4 text-indigo-600 border-border rounded focus:ring-indigo-500"
              />
              <span className="text-sm text-foreground">Anonymize</span>
            </label>
          </div>
        </motion.div>

        {/* Reports Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredReports.map((report, index) => (
            <motion.div 
              key={report.employeeId} 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * index }}
              className="glass rounded-xl p-6 hover:shadow-premium transition-all duration-300"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-medium">
                    {report.employeeName.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{report.employeeName}</h3>
                    {report.employee?.department && (
                      <p className="text-sm text-muted">{report.employee.department}</p>
                    )}
                  </div>
                </div>
                <div className={`text-2xl font-bold ${getScoreColor(report.overallScore)}`}>
                  {report.overallScore?.toFixed(1) || '0.0'}%
                </div>
              </div>
              
              {/* Score Bar */}
              <div className="mb-4">
                <div className="w-full bg-surface rounded-full h-2">
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
                      <span className="text-muted">
                        {RELATIONSHIP_TYPE_LABELS[b.relationshipType as RelationshipType] || b.relationshipType}
                      </span>
                      <span className="font-medium text-foreground">{b.normalizedScore?.toFixed(2) || '0.00'}/4.0</span>
                    </div>
                  ))}
                </div>
              )}
              
              {(!report.breakdown || report.breakdown.length === 0) && (
                <div className="py-4 border-t border-border">
                  <p className="text-sm text-muted text-center">No evaluations yet</p>
                </div>
              )}

              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => handleViewPDF(report.employeeId)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm transition-colors"
                >
                  <Eye className="w-4 h-4" />
                  View
                </button>
                <button
                  onClick={() => handleDownloadPDF(report.employeeId, report.employeeName)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 text-sm transition-colors"
                >
                  <Download className="w-4 h-4" />
                  PDF
                </button>
              </div>
            </motion.div>
          ))}
        </div>

        {filteredReports.length === 0 && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="glass rounded-xl p-12 text-center"
          >
            <FileText className="w-12 h-12 text-muted mx-auto mb-4" />
            <p className="text-muted">No reports found matching your criteria.</p>
          </motion.div>
        )}

        <p className="mt-6 text-sm text-muted text-center">
          Showing {filteredReports.length} of {reports.length} reports
        </p>

        <PageFooter />
      </PageContent>
    </PageContainer>
  )
}
