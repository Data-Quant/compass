'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { LoadingScreen } from '@/components/composed/LoadingScreen'
import { Plus, Trash2 } from 'lucide-react'

const stagger = {
  container: { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } },
  item: { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } },
}

interface BenefitCategoryRow {
  id: string
  name: string
  region: string
  employeeType: string
  isActive: boolean
  _count?: {
    benefits: number
    users: number
  }
}

interface BenefitRow {
  id: string
  categoryId: string
  title: string
  description: string
  orderIndex: number
  isActive: boolean
}

export default function OnboardingBenefitsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [categories, setCategories] = useState<BenefitCategoryRow[]>([])
  const [benefits, setBenefits] = useState<BenefitRow[]>([])

  const [categoryForm, setCategoryForm] = useState({
    region: '',
    employeeType: '',
  })
  const [benefitForm, setBenefitForm] = useState({
    categoryId: '',
    title: '',
    description: '',
    orderIndex: 0,
  })

  const loadData = async () => {
    try {
      const [categoriesRes, benefitsRes] = await Promise.all([
        fetch('/api/admin/benefits/categories'),
        fetch('/api/admin/benefits'),
      ])
      const [categoriesData, benefitsData] = await Promise.all([categoriesRes.json(), benefitsRes.json()])
      if (!categoriesRes.ok) throw new Error(categoriesData.error || 'Failed to load benefit categories')
      if (!benefitsRes.ok) throw new Error(benefitsData.error || 'Failed to load benefits')

      const categoryRows = categoriesData.categories || []
      setCategories(categoryRows)
      setBenefits(benefitsData.benefits || [])
      setBenefitForm((prev) => ({
        ...prev,
        categoryId: prev.categoryId || categoryRows[0]?.id || '',
      }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to load benefits')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const createCategory = async () => {
    if (!categoryForm.region.trim() || !categoryForm.employeeType.trim()) {
      toast.error('Region and employee type are required')
      return
    }

    setSaving(true)
    try {
      const name = `${categoryForm.region.trim()} - ${categoryForm.employeeType.trim()}`
      const res = await fetch('/api/admin/benefits/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          region: categoryForm.region.trim(),
          employeeType: categoryForm.employeeType.trim(),
          isActive: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create category')
      toast.success('Benefit category created')
      setCategoryForm({ region: '', employeeType: '' })
      await loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create category')
    } finally {
      setSaving(false)
    }
  }

  const createBenefit = async () => {
    if (!benefitForm.categoryId || !benefitForm.title.trim() || !benefitForm.description.trim()) {
      toast.error('Category, title, and description are required')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/benefits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryId: benefitForm.categoryId,
          title: benefitForm.title.trim(),
          description: benefitForm.description.trim(),
          orderIndex: benefitForm.orderIndex,
          isActive: true,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create benefit')
      toast.success('Benefit created')
      setBenefitForm({
        categoryId: benefitForm.categoryId,
        title: '',
        description: '',
        orderIndex: benefitForm.orderIndex + 1,
      })
      await loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create benefit')
    } finally {
      setSaving(false)
    }
  }

  const deleteBenefit = async (benefitId: string) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/benefits/${benefitId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete benefit')
      toast.success('Benefit deleted')
      await loadData()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete benefit')
    } finally {
      setSaving(false)
    }
  }

  const benefitsByCategory = useMemo(() => {
    const map = new Map<string, BenefitRow[]>()
    for (const benefit of benefits) {
      if (!map.has(benefit.categoryId)) {
        map.set(benefit.categoryId, [])
      }
      map.get(benefit.categoryId)!.push(benefit)
    }
    for (const [key, list] of map.entries()) {
      map.set(
        key,
        [...list].sort((a, b) => a.orderIndex - b.orderIndex || a.title.localeCompare(b.title))
      )
    }
    return map
  }, [benefits])

  if (loading) {
    return <LoadingScreen message="Loading benefits..." />
  }

  return (
    <div className="p-6 sm:p-8 max-w-6xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-display font-light text-foreground tracking-tight">Benefits</h1>
        <p className="text-muted-foreground mt-1">Manage benefit categories and benefit items for users.</p>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardContent className="p-6 space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Add Benefit Category</h2>
            <div>
              <Label className="mb-1">Region</Label>
              <Input
                value={categoryForm.region}
                onChange={(e) => setCategoryForm({ ...categoryForm, region: e.target.value })}
                placeholder="Pakistan"
              />
            </div>
            <div>
              <Label className="mb-1">Employee Type</Label>
              <Input
                value={categoryForm.employeeType}
                onChange={(e) => setCategoryForm({ ...categoryForm, employeeType: e.target.value })}
                placeholder="Plutus21 Employee"
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={createCategory} disabled={saving}>
                <Plus className="w-4 h-4" /> Add Category
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Add Benefit</h2>
            <div>
              <Label className="mb-1">Category</Label>
              <Select
                value={benefitForm.categoryId || '__none__'}
                onValueChange={(value) => setBenefitForm({ ...benefitForm, categoryId: value === '__none__' ? '' : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select category</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1">Title</Label>
              <Input
                value={benefitForm.title}
                onChange={(e) => setBenefitForm({ ...benefitForm, title: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-1">Description</Label>
              <Textarea
                value={benefitForm.description}
                onChange={(e) => setBenefitForm({ ...benefitForm, description: e.target.value })}
              />
            </div>
            <div>
              <Label className="mb-1">Order</Label>
              <Input
                type="number"
                value={benefitForm.orderIndex}
                onChange={(e) => setBenefitForm({ ...benefitForm, orderIndex: Number(e.target.value) || 0 })}
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={createBenefit} disabled={saving}>
                <Plus className="w-4 h-4" /> Add Benefit
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={stagger.container} initial="hidden" animate="visible" className="space-y-4">
        {categories.map((category) => (
          <motion.div key={category.id} variants={stagger.item}>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">{category.name}</h3>
                  <p className="text-sm text-muted-foreground">{category.region} · {category.employeeType}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{category._count?.users ?? 0} users</Badge>
                  <Badge variant="secondary">{category._count?.benefits ?? 0} benefits</Badge>
                </div>
              </div>

              {(benefitsByCategory.get(category.id) || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No benefits defined for this category.</p>
              ) : (
                <div className="space-y-2">
                  {(benefitsByCategory.get(category.id) || []).map((benefit) => (
                    <div key={benefit.id} className="rounded-md border border-border px-3 py-2 transition-colors hover:bg-muted/40">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">{benefit.title}</p>
                          <p className="text-xs text-muted-foreground">{benefit.description}</p>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => deleteBenefit(benefit.id)} disabled={saving}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          </motion.div>
        ))}
      </motion.div>
    </div>
  )
}
