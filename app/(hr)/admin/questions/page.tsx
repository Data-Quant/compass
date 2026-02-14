'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { PageHeader } from '@/components/layout/page-header'
import { PageFooter } from '@/components/layout/page-footer'
import { PageContainer, PageContent } from '@/components/layout/page-container'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { RELATIONSHIP_TYPE_LABELS, RelationshipType } from '@/types'
import { HelpCircle, Plus, Edit2, Trash2, Star, MessageSquare } from 'lucide-react'

interface Question {
  id: string; questionText: string; questionType: 'RATING' | 'TEXT'; relationshipType: RelationshipType; maxRating: number; orderIndex: number
}

export default function QuestionsPage() {
  const router = useRouter()
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState<string>('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null)
  const [questionToDelete, setQuestionToDelete] = useState<Question | null>(null)
  const [formData, setFormData] = useState({ questionText: '', questionType: 'RATING', relationshipType: 'PEER', maxRating: 4 })
  const [saving, setSaving] = useState(false)

  useEffect(() => { checkAuth() }, [])

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/session')
      const data = await res.json()
      if (!data.user || data.user.role !== 'HR') { router.push('/login'); return }
      loadQuestions()
    } catch { router.push('/login') }
  }

  const loadQuestions = async () => {
    try {
      const url = filterType ? `/api/admin/questions?relationshipType=${filterType}` : '/api/admin/questions'
      const res = await fetch(url)
      const data = await res.json()
      setQuestions(data.questions || [])
    } catch { toast.error('Failed to load questions') }
    finally { setLoading(false) }
  }

  useEffect(() => { if (!loading) loadQuestions() }, [filterType])

  const handleOpenModal = (question?: Question) => {
    if (question) {
      setSelectedQuestion(question)
      setFormData({ questionText: question.questionText, questionType: question.questionType, relationshipType: question.relationshipType, maxRating: question.maxRating })
    } else {
      setSelectedQuestion(null)
      setFormData({ questionText: '', questionType: 'RATING', relationshipType: 'PEER', maxRating: 4 })
    }
    setIsModalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.questionText) { toast.error('Question text required'); return }
    setSaving(true)
    try {
      const method = selectedQuestion ? 'PUT' : 'POST'
      const body = selectedQuestion ? { ...formData, id: selectedQuestion.id } : formData
      const res = await fetch('/api/admin/questions', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = await res.json()
      if (data.error) toast.error(data.error)
      else { toast.success(selectedQuestion ? 'Question updated' : 'Question created'); setIsModalOpen(false); loadQuestions() }
    } catch { toast.error('Failed to save') }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!questionToDelete) return
    try {
      const res = await fetch('/api/admin/questions', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: questionToDelete.id }) })
      const data = await res.json()
      if (data.error) toast.error(data.error)
      else { toast.success('Question deleted'); loadQuestions() }
    } catch { toast.error('Failed to delete') }
    finally { setIsDeleteDialogOpen(false); setQuestionToDelete(null) }
  }

  const relationshipTypes = Object.keys(RELATIONSHIP_TYPE_LABELS) as RelationshipType[]

  if (loading) {
    return (
      <PageContainer>
        <LoadingScreen message="Loading questions..." />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader backHref="/admin" backLabel="Back to Admin" badge="Questions" />
      
      <PageContent>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground font-display">Question Bank</h1>
            <p className="text-muted-foreground mt-1">{questions.length} questions configured</p>
          </div>
          <div className="flex gap-3 mt-4 md:mt-0">
            <Select value={filterType || '__all__'} onValueChange={(v) => setFilterType(v === '__all__' ? '' : v)}>
              <SelectTrigger className="min-w-[140px]">
                <SelectValue placeholder="All Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Types</SelectItem>
                {relationshipTypes.map(t => <SelectItem key={t} value={t}>{RELATIONSHIP_TYPE_LABELS[t]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={() => handleOpenModal()}>
              <Plus className="w-4 h-4" /> Add Question
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          {questions.map((question, index) => (
            <motion.div key={question.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 * index }}>
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${question.questionType === 'RATING' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'}`}>
                      {question.questionType === 'RATING' ? <Star className="w-5 h-5" /> : <MessageSquare className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground">{question.questionText}</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <Badge variant="secondary" className="text-muted-foreground">
                          {RELATIONSHIP_TYPE_LABELS[question.relationshipType]}
                        </Badge>
                        <Badge variant="secondary" className="text-muted-foreground">
                          {question.questionType}
                        </Badge>
                        {question.questionType === 'RATING' && (
                          <Badge variant="secondary" className="text-muted-foreground">
                            Max: {question.maxRating}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button variant="ghost" size="icon" onClick={() => handleOpenModal(question)} className="text-muted-foreground hover:text-foreground hover:bg-muted">
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => { setQuestionToDelete(question); setIsDeleteDialogOpen(true) }} className="text-muted-foreground hover:text-red-500 hover:bg-red-500/10">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {questions.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Card>
              <CardContent className="p-12 text-center">
                <HelpCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No questions found</p>
              </CardContent>
            </Card>
          </motion.div>
        )}

        <PageFooter />
      </PageContent>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={selectedQuestion ? 'Edit Question' : 'Add Question'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="question-text" className="mb-1">Question Text *</Label>
            <Textarea id="question-text" value={formData.questionText} onChange={(e) => setFormData({ ...formData, questionText: e.target.value })} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="question-type" className="mb-1">Type</Label>
              <Select value={formData.questionType} onValueChange={(v) => setFormData({ ...formData, questionType: v as any })}>
                <SelectTrigger id="question-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RATING">Rating (1-4)</SelectItem>
                  <SelectItem value="TEXT">Text Response</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="relationship-type" className="mb-1">Relationship Type</Label>
              <Select value={formData.relationshipType} onValueChange={(v) => setFormData({ ...formData, relationshipType: v as any })}>
                <SelectTrigger id="relationship-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {relationshipTypes.map(t => <SelectItem key={t} value={t}>{RELATIONSHIP_TYPE_LABELS[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={isDeleteDialogOpen} onClose={() => setIsDeleteDialogOpen(false)} onConfirm={handleDelete} title="Delete Question" message="Are you sure you want to delete this question?" confirmText="Delete" variant="danger" />
    </PageContainer>
  )
}

