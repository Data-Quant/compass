import { NextRequest, NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { getSession } from '@/lib/auth'
import { isAdminRole } from '@/lib/permissions'
import { prisma } from '@/lib/db'
import { toRatingDescriptionFields } from '@/lib/rating-descriptions'
import {
  bankQuestionProblem,
  createBankQuestionSchema,
  deleteBankQuestionSchema,
  MANAGED_BANK_QUESTIONS,
  updateBankQuestionSchema,
} from '@/lib/weekly/bank-questions'

// The quarter-end form questions and the weekly comment questions (lib/weekly/bank-questions.ts).

async function authorised(): Promise<boolean> {
  const user = await getSession()
  return Boolean(user && isAdminRole(user.role))
}

function failure(error: unknown, action: string): NextResponse {
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues.map((i) => i.message).join('; ') }, { status: 400 })
  if (error instanceof SyntaxError) return NextResponse.json({ error: 'The request body is not valid JSON' }, { status: 400 })
  console.error(`Failed to ${action} question:`, error)
  return NextResponse.json({ error: `Failed to ${action} question` }, { status: 500 })
}

/** Rating descriptions belong to rating questions only. */
function descriptionFields(type: 'RATING' | 'TEXT', descriptions: Record<string, string> | undefined) {
  return toRatingDescriptionFields(type === 'RATING' ? descriptions : null)
}

export async function GET() {
  try {
    if (!(await authorised())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const questions = await prisma.evaluationQuestion.findMany({
      where: MANAGED_BANK_QUESTIONS,
      orderBy: [{ relationshipType: 'asc' }, { orderIndex: 'asc' }],
    })
    return NextResponse.json({ questions })
  } catch (error) {
    return failure(error, 'fetch')
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await authorised())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const input = createBankQuestionSchema.parse(await request.json())
    const problem = bankQuestionProblem(input.relationshipType, input.questionType)
    if (problem) return NextResponse.json({ error: problem }, { status: 400 })
    const last = await prisma.evaluationQuestion.findFirst({ where: { relationshipType: input.relationshipType }, orderBy: { orderIndex: 'desc' } })
    const question = await prisma.evaluationQuestion.create({
      data: {
        relationshipType: input.relationshipType,
        questionText: input.questionText,
        questionType: input.questionType,
        maxRating: 4,
        ...descriptionFields(input.questionType, input.ratingDescriptions),
        orderIndex: (last?.orderIndex ?? 0) + 1,
      },
    })
    return NextResponse.json({ success: true, question })
  } catch (error) {
    return failure(error, 'create')
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!(await authorised())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const input = updateBankQuestionSchema.parse(await request.json())
    const existing = await prisma.evaluationQuestion.findUnique({ where: { id: input.id }, select: { relationshipType: true, questionType: true } })
    if (!existing) return NextResponse.json({ error: 'Question not found' }, { status: 404 })
    const problem = bankQuestionProblem(existing.relationshipType, existing.questionType) ?? bankQuestionProblem(existing.relationshipType, input.questionType)
    if (problem) return NextResponse.json({ error: problem }, { status: 400 })
    const question = await prisma.evaluationQuestion.update({
      where: { id: input.id },
      data: { questionText: input.questionText, questionType: input.questionType, ...descriptionFields(input.questionType, input.ratingDescriptions) },
    })
    return NextResponse.json({ success: true, question })
  } catch (error) {
    return failure(error, 'update')
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!(await authorised())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = deleteBankQuestionSchema.parse(await request.json())
    const question = await prisma.evaluationQuestion.findUnique({ where: { id }, select: { relationshipType: true, questionType: true, _count: { select: { evaluations: true } } } })
    if (!question) return NextResponse.json({ error: 'Question not found' }, { status: 404 })
    const problem = bankQuestionProblem(question.relationshipType, question.questionType)
    if (problem) return NextResponse.json({ error: problem }, { status: 400 })
    // Answered questions stay, so past results keep their wording.
    const asked = question._count.evaluations + (await prisma.weeklyPrompt.count({ where: { questionId: id } }))
    if (asked > 0) return NextResponse.json({ error: 'This question has been asked, so it stays with its answers. Change its wording instead.' }, { status: 400 })
    await prisma.evaluationQuestion.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return failure(error, 'delete')
  }
}
