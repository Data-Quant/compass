import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { SELF_EVALUATION_QUESTION_TYPES } from '@/lib/self-evaluation'

// GET - list all self-evaluation bank questions (active + inactive), ordered
export async function GET() {
  const user = await getSession()
  if (!user || !isAdminRole(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const questions = await prisma.selfEvaluationQuestion.findMany({
    orderBy: { orderIndex: 'asc' },
  })
  return NextResponse.json({ questions })
}

// POST - create a question
export async function POST(request: NextRequest) {
  const user = await getSession()
  if (!user || !isAdminRole(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { section, prompt, helpText, type } = await request.json()
  if (!section || !prompt || !SELF_EVALUATION_QUESTION_TYPES.includes(type)) {
    return NextResponse.json(
      { error: 'section, prompt and a valid type (TEXT, LIST, GOAL_TABLE) are required' },
      { status: 400 }
    )
  }
  const last = await prisma.selfEvaluationQuestion.findFirst({ orderBy: { orderIndex: 'desc' } })
  const question = await prisma.selfEvaluationQuestion.create({
    data: {
      section,
      prompt,
      helpText: helpText || null,
      type,
      orderIndex: (last?.orderIndex || 0) + 1,
    },
  })
  return NextResponse.json({ success: true, question })
}

// PUT - update a question (wording/section/help/type/order/active)
export async function PUT(request: NextRequest) {
  const user = await getSession()
  if (!user || !isAdminRole(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id, section, prompt, helpText, type, orderIndex, isActive } = await request.json()
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }
  if (type && !SELF_EVALUATION_QUESTION_TYPES.includes(type)) {
    return NextResponse.json({ error: 'invalid type' }, { status: 400 })
  }
  const question = await prisma.selfEvaluationQuestion.update({
    where: { id },
    data: {
      ...(section !== undefined ? { section } : {}),
      ...(prompt !== undefined ? { prompt } : {}),
      ...(helpText !== undefined ? { helpText: helpText || null } : {}),
      ...(type !== undefined ? { type } : {}),
      ...(orderIndex !== undefined ? { orderIndex } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
    },
  })
  return NextResponse.json({ success: true, question })
}

// DELETE - remove a question
export async function DELETE(request: NextRequest) {
  const user = await getSession()
  if (!user || !isAdminRole(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(request.url)
  const body = await request.json().catch(() => null)
  const id = searchParams.get('id') || body?.id
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }
  await prisma.selfEvaluationQuestion.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
