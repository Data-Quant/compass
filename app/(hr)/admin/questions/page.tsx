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
        <div className="min-h-screen flex items-center justify-center">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full gradient-primary animate-pulse" />
            <p className="text-muted text-sm">Loading questions...</p>
          </motion.div>
        </div>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader backHref="/admin" backLabel="Back to Admin" badge="Questions" />
      
      <PageContent>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Question Bank</h1>
            <p className="text-muted mt-1">{questions.length} questions configured</p>
          </div>
          <div className="flex gap-3 mt-4 md:mt-0">
            <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="px-4 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50">
              <option value="">All Types</option>
              {relationshipTypes.map(t => <option key={t} value={t}>{RELATIONSHIP_TYPE_LABELS[t]}</option>)}
            </select>
            <button onClick={() => handleOpenModal()} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
              <Plus className="w-4 h-4" /> Add Question
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {questions.map((question, index) => (
            <motion.div key={question.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.03 * index }} className="glass rounded-xl p-5">
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${question.questionType === 'RATING' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'}`}>
                  {question.questionType === 'RATING' ? <Star className="w-5 h-5" /> : <MessageSquare className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground">{question.questionText}</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="px-2 py-0.5 bg-surface text-muted rounded text-xs">{RELATIONSHIP_TYPE_LABELS[question.relationshipType]}</span>
                    <span className="px-2 py-0.5 bg-surface text-muted rounded text-xs">{question.questionType}</span>
                    {question.questionType === 'RATING' && <span className="px-2 py-0.5 bg-surface text-muted rounded text-xs">Max: {question.maxRating}</span>}
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => handleOpenModal(question)} className="p-2 text-muted hover:text-foreground hover:bg-surface rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => { setQuestionToDelete(question); setIsDeleteDialogOpen(true) }} className="p-2 text-muted hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {questions.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass rounded-xl p-12 text-center">
            <HelpCircle className="w-12 h-12 text-muted mx-auto mb-4" />
            <p className="text-muted">No questions found</p>
          </motion.div>
        )}

        <PageFooter />
      </PageContent>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={selectedQuestion ? 'Edit Question' : 'Add Question'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Question Text *</label>
            <textarea value={formData.questionText} onChange={(e) => setFormData({ ...formData, questionText: e.target.value })} rows={3} className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Type</label>
              <select value={formData.questionType} onChange={(e) => setFormData({ ...formData, questionType: e.target.value as any })} className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50">
                <option value="RATING">Rating (1-4)</option>
                <option value="TEXT">Text Response</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Relationship Type</label>
              <select value={formData.relationshipType} onChange={(e) => setFormData({ ...formData, relationshipType: e.target.value as any })} className="w-full px-4 py-2 bg-surface border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/50">
                {relationshipTypes.map(t => <option key={t} value={t}>{RELATIONSHIP_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 border border-border rounded-lg hover:bg-surface text-foreground transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog isOpen={isDeleteDialogOpen} onClose={() => setIsDeleteDialogOpen(false)} onConfirm={handleDelete} title="Delete Question" message="Are you sure you want to delete this question?" confirmText="Delete" variant="danger" />
    </PageContainer>
  )
}
