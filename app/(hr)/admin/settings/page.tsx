'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { RelationshipType, DEFAULT_WEIGHTAGES, RELATIONSHIP_TYPE_LABELS } from '@/types'
import { PageHeader } from '@/components/layout/page-header'
import { PageFooter } from '@/components/layout/page-footer'
import { PageContainer, PageContent } from '@/components/layout/page-container'
import { Sliders, Save, RotateCcw, Info } from 'lucide-react'

export default function SettingsPage() {
  const router = useRouter()
  const [employees, setEmployees] = useState<any[]>([])
  const [selectedEmployee, setSelectedEmployee] = useState<string>('')
  const [weightages, setWeightages] = useState<Record<RelationshipType, number>>(DEFAULT_WEIGHTAGES)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/auth/session')
      .then((res) => res.json())
      .then((data) => {
        if (!data.user || data.user.role !== 'HR') {
          router.push('/login')
          return
        }
        loadEmployees()
      })
      .catch(() => router.push('/login'))
  }, [])

  useEffect(() => {
    if (selectedEmployee) {
      loadWeightages(selectedEmployee)
    }
  }, [selectedEmployee])

  const loadEmployees = async () => {
    try {
      const response = await fetch('/api/auth/login')
      const data = await response.json()
      const employeeList = data.users?.filter((u: any) => u.role === 'EMPLOYEE') || []
      setEmployees(employeeList)
      if (employeeList.length > 0) {
        setSelectedEmployee(employeeList[0].id)
      }
    } catch (error) {
      toast.error('Failed to load employees')
    } finally {
      setLoading(false)
    }
  }

  const loadWeightages = async (employeeId: string) => {
    try {
      const response = await fetch(`/api/admin/weightages?employeeId=${employeeId}`)
      const data = await response.json()
      if (data.weightages && data.weightages.length > 0) {
        const customWeightages: Record<RelationshipType, number> = { ...DEFAULT_WEIGHTAGES }
        data.weightages.forEach((w: { relationshipType: RelationshipType; weightagePercentage: number }) => {
          customWeightages[w.relationshipType] = w.weightagePercentage
        })
        setWeightages(customWeightages)
      } else {
        setWeightages(DEFAULT_WEIGHTAGES)
      }
    } catch (error) {
      toast.error('Failed to load weightages')
      setWeightages(DEFAULT_WEIGHTAGES)
    }
  }

  const handleWeightageChange = (type: RelationshipType, value: number) => {
    setWeightages((prev) => ({
      ...prev,
      [type]: Math.max(0, Math.min(100, value)) / 100,
    }))
  }

  const calculateTotal = () => {
    return Object.values(weightages).reduce((sum, w) => sum + w, 0) * 100
  }

  const handleSave = async () => {
    const total = calculateTotal()
    if (Math.abs(total - 100) > 0.01) {
      toast.error(`Weightages must sum to 100%. Current total: ${total.toFixed(2)}%`)
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/admin/weightages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: selectedEmployee,
          weightages: Object.entries(weightages).map(([type, percentage]) => ({
            relationshipType: type,
            weightagePercentage: percentage,
          })),
        }),
      })

      const data = await response.json()
      if (data.success) {
        toast.success('Weightages saved successfully!')
      } else {
        toast.error(data.error || 'Failed to save weightages')
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to save weightages')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setWeightages(DEFAULT_WEIGHTAGES)
    toast.info('Weightages reset to defaults')
  }

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
            <p className="text-muted text-sm">Loading settings...</p>
          </motion.div>
        </div>
      </PageContainer>
    )
  }

  const total = calculateTotal()
  const isValid = Math.abs(total - 100) < 0.01

  return (
    <PageContainer>
      <PageHeader backHref="/admin" backLabel="Back to Admin" badge="Settings" />
      
      <PageContent className="max-w-4xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Weightage Settings</h1>
          <p className="text-muted mt-1">Configure custom weightages for performance calculations</p>
        </div>

        {/* Employee Selector */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-xl p-6 mb-6"
        >
          <label className="block text-sm font-medium text-foreground mb-2">
            Select Employee
          </label>
          <select
            value={selectedEmployee}
            onChange={(e) => setSelectedEmployee(e.target.value)}
            className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          >
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name} {emp.department ? `(${emp.department})` : ''}
              </option>
            ))}
          </select>
        </motion.div>

        {/* Weightages */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass rounded-xl p-6 mb-6"
        >
          <div className="flex items-center gap-2 mb-6">
            <Sliders className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-lg font-semibold text-foreground">Custom Weightages</h2>
          </div>
          
          <p className="text-sm text-muted mb-6">
            Adjust weightages for this employee. Total must equal 100%.
          </p>

          <div className="space-y-5">
            {(Object.keys(weightages) as RelationshipType[]).map((type, index) => (
              <motion.div 
                key={type} 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.05 * index }}
                className="flex items-center gap-4"
              >
                <label className="flex-1 text-sm font-medium text-foreground">
                  {RELATIONSHIP_TYPE_LABELS[type]}
                </label>
                <div className="flex items-center gap-4 flex-1">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={(weightages[type] * 100).toFixed(1)}
                    onChange={(e) =>
                      handleWeightageChange(type, parseFloat(e.target.value) || 0)
                    }
                    className="w-24 px-3 py-2 bg-surface border border-border rounded-lg text-foreground text-center focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                  <span className="text-sm text-muted w-6">%</span>
                  <div className="flex-1 hidden sm:block">
                    <div className="w-full bg-surface rounded-full h-2">
                      <div
                        className="bg-indigo-600 h-2 rounded-full transition-all"
                        style={{ width: `${weightages[type] * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="mt-8 pt-6 border-t border-border">
            <div className="flex justify-between items-center mb-4">
              <span className="text-lg font-semibold text-foreground">Total:</span>
              <span
                className={`text-2xl font-bold ${
                  isValid ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                }`}
              >
                {total.toFixed(2)}%
              </span>
            </div>
            {!isValid && (
              <p className="text-sm text-red-600 dark:text-red-400 mb-4">
                Weightages must sum to exactly 100%
              </p>
            )}
          </div>

          <div className="flex gap-4 mt-6">
            <button
              onClick={handleSave}
              disabled={!isValid || saving}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Weightages'}
            </button>
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-6 py-2.5 border border-border rounded-lg hover:bg-surface text-foreground transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reset to Defaults
            </button>
          </div>
        </motion.div>

        {/* Info Box */}
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-6"
        >
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-indigo-900 dark:text-indigo-200 mb-2">Default Weightages</h3>
              <ul className="text-sm text-indigo-800 dark:text-indigo-300 space-y-1">
                <li>• C-Level Executive: 40%</li>
                <li>• Team Lead/Manager: 30%</li>
                <li>• Direct Reports: 15%</li>
                <li>• Peer: 10%</li>
                <li>• HR: 5%</li>
                <li>• Self-Evaluation: 0%</li>
              </ul>
            </div>
          </div>
        </motion.div>

        <PageFooter />
      </PageContent>
    </PageContainer>
  )
}
