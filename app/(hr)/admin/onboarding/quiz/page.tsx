'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { Plus, Save, Trash2 } from 'lucide-react'

const stagger = {
  container: { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } },
  item: { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } },
}

interface QuizQuestionRow {
  id: string
  questionText: string
  optionsJson: unknown
  correctAnswer: string
  orderIndex: number
  isActive: boolean
}

interface UserOption {
  id: string
  name: string
}

export default function AdminOnboardingQuizPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [questions, setQuestions] = useState<QuizQuestionRow[]>([])
  const [users, setUsers] = useState<UserOption[]>([])
  const [selectedResetUserId, setSelectedResetUserId] = useState('')
  const [form, setForm] = useState({
    questionText: '',
    optionsText: '',
    correctAnswer: '',
    orderIndex: 1,
  })

  const loadData = async () => {
    try {
      const [questionsRes, usersRes] = await Promise.all([
        fetch('/api/admin/onboarding/quiz-questions'),
        fetch('/api/users'),
      ])
      const [questionsData, usersData] = await Promise.all([questionsRes.json(), usersRes.json()])
      if (!questionsRes.ok) throw new Error(questionsData.error || 'Failed to load quiz questions')
      if (!usersRes.ok) throw new Error(usersData.error || 'Failed to load users')

      setQuestions(questionsData.questions || [])
      setUsers(usersData.users || [])
      const maxOrder = (questionsData.questions || []).reduce(
        (max: number, question: QuizQuestionRow) => Math.max(max, question.orderIndex),
        0
      )
      setForm((prev) => ({ ...prev, orderIndex: maxOrder + 1 }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load quiz management')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const parseOptions = (text: string) =>
    text
      .split('\n')
      .map((option) => option.trim())
      .filter(Boolean)

  const createQuestion = async () => {
    const options = parseOptions(form.optionsText)
    if (!form.questionText.trim() || options.length < 2 || !form.correctAnswer.trim()) {
      toast.error('Question, options (2+), and correct answer are required')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/onboarding/quiz-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionText: form.questionText,
          options,
          correctAnswer: form.correctAnswer.trim(),
          orderIndex: form.orderIndex,
          isActive: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create question')
      toast.success('Question created')
      setForm({
        questionText: '',
        optionsText: '',
        correctAnswer: '',
        orderIndex: form.orderIndex + 1,
      })
      await loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create question')
    } finally {
      setSaving(false)
    }
  }

  const saveQuestion = async (question: QuizQuestionRow) => {
    setSaving(true)
    try {
      const options = Array.isArray(question.optionsJson)
        ? question.optionsJson.filter((item): item is string => typeof item === 'string')
        : []
      const res = await fetch(`/api/admin/onboarding/quiz-questions/${question.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionText: question.questionText,
          options,
          correctAnswer: question.correctAnswer,
          orderIndex: question.orderIndex,
          isActive: question.isActive,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update question')
      toast.success('Question updated')
      await loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update question')
    } finally {
      setSaving(false)
    }
  }

  const deleteQuestion = async (questionId: string) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/onboarding/quiz-questions/${questionId}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete question')
      toast.success('Question deleted')
      await loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete question')
    } finally {
      setSaving(false)
    }
  }

  const resetAttempts = async () => {
    if (!selectedResetUserId) {
      toast.error('Select a user to reset attempts')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/onboarding/quiz-attempts/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedResetUserId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to reset attempts')
      toast.success('Quiz attempts reset')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to reset attempts')
    } finally {
      setSaving(false)
    }
  }

  const sortedQuestions = useMemo(
    () => [...questions].sort((a, b) => a.orderIndex - b.orderIndex),
    [questions]
  )

  if (loading) {
    return <LoadingScreen message="Loading quiz management..." />
  }

  return (
    <div className="p-6 sm:p-8 max-w-6xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-display font-light text-foreground tracking-tight">Quiz Management</h1>
        <p className="text-muted-foreground mt-1">Manage onboarding quiz questions and reset locked users.</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
      <Card className="mb-6">
        <CardContent className="p-6 space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Add Question</h2>
          <div>
            <Label className="mb-1">Question</Label>
            <Input
              value={form.questionText}
              onChange={(e) => setForm({ ...form, questionText: e.target.value })}
            />
          </div>
          <div>
            <Label className="mb-1">Options (one per line)</Label>
            <Textarea
              value={form.optionsText}
              onChange={(e) => setForm({ ...form, optionsText: e.target.value })}
              className="min-h-[120px]"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="mb-1">Correct Answer</Label>
              <Input
                value={form.correctAnswer}
                onChange={(e) => setForm({ ...form, correctAnswer: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-1">Order Index</Label>
              <Input
                type="number"
                min={1}
                value={form.orderIndex}
                onChange={(e) => setForm({ ...form, orderIndex: Number(e.target.value) || 1 })}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={createQuestion} disabled={saving}>
              <Plus className="w-4 h-4" /> Add Question
            </Button>
          </div>
        </CardContent>
      </Card>

      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
      <Card className="mb-6">
        <CardContent className="p-6 space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Reset Quiz Attempts</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={selectedResetUserId || '__none__'} onValueChange={(value) => setSelectedResetUserId(value === '__none__' ? '' : value)}>
              <SelectTrigger className="sm:w-[320px]">
                <SelectValue placeholder="Select user" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Select user</SelectItem>
                {users.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={resetAttempts} disabled={saving}>
              Reset Attempts
            </Button>
          </div>
        </CardContent>
      </Card>
      </motion.div>

      <motion.div variants={stagger.container} initial="hidden" animate="visible" className="space-y-4">
        {sortedQuestions.map((question) => {
          const options = Array.isArray(question.optionsJson)
            ? question.optionsJson.filter((item): item is string => typeof item === 'string')
            : []
          return (
            <motion.div key={question.id} variants={stagger.item}>
            <Card>
              <CardContent className="p-6 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <Badge variant="secondary">Order {question.orderIndex}</Badge>
                  <Badge
                    variant="secondary"
                    className={
                      question.isActive
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'bg-slate-500/10 text-slate-600 dark:text-slate-400'
                    }
                  >
                    {question.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <Input
                  value={question.questionText}
                  onChange={(e) =>
                    setQuestions((prev) =>
                      prev.map((item) =>
                        item.id === question.id ? { ...item, questionText: e.target.value } : item
                      )
                    )
                  }
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="mb-1">Correct Answer</Label>
                    <Input
                      value={question.correctAnswer}
                      onChange={(e) =>
                        setQuestions((prev) =>
                          prev.map((item) =>
                            item.id === question.id ? { ...item, correctAnswer: e.target.value } : item
                          )
                        )
                      }
                    />
                  </div>
                  <div>
                    <Label className="mb-1">Order Index</Label>
                    <Input
                      type="number"
                      value={question.orderIndex}
                      onChange={(e) =>
                        setQuestions((prev) =>
                          prev.map((item) =>
                            item.id === question.id
                              ? { ...item, orderIndex: Number(e.target.value) || 1 }
                              : item
                          )
                        )
                      }
                    />
                  </div>
                </div>
                <div>
                  <Label className="mb-1">Options</Label>
                  <Textarea
                    value={options.join('\n')}
                    onChange={(e) => {
                      const nextOptions = parseOptions(e.target.value)
                      setQuestions((prev) =>
                        prev.map((item) =>
                          item.id === question.id ? { ...item, optionsJson: nextOptions } : item
                        )
                      )
                    }}
                    className="min-h-[110px]"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => saveQuestion(question)} disabled={saving}>
                    <Save className="w-4 h-4" /> Save
                  </Button>
                  <Button variant="ghost" onClick={() => deleteQuestion(question.id)} disabled={saving}>
                    <Trash2 className="w-4 h-4" /> Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
            </motion.div>
          )
        })}
      </motion.div>
    </div>
  )
}
