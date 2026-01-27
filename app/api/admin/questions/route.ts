import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'

// GET - List all evaluation questions
export async function GET(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || user.role !== 'HR') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const relationshipType = searchParams.get('relationshipType')

    const where = relationshipType ? { relationshipType: relationshipType as any } : {}

    const questions = await prisma.evaluationQuestion.findMany({
      where,
      orderBy: [
        { relationshipType: 'asc' },
        { orderIndex: 'asc' },
      ],
    })

    return NextResponse.json({ questions })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch questions' },
      { status: 500 }
    )
  }
}

// POST - Create a new question
export async function POST(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || user.role !== 'HR') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { relationshipType, questionText, questionType, maxRating } = await request.json()

    if (!relationshipType || !questionText) {
      return NextResponse.json(
        { error: 'Relationship type and question text are required' },
        { status: 400 }
      )
    }

    // Get the next order index for this relationship type
    const lastQuestion = await prisma.evaluationQuestion.findFirst({
      where: { relationshipType },
      orderBy: { orderIndex: 'desc' },
    })

    const orderIndex = (lastQuestion?.orderIndex || 0) + 1

    const question = await prisma.evaluationQuestion.create({
      data: {
        relationshipType,
        questionText,
        questionType: questionType || 'RATING',
        maxRating: maxRating || 4,
        orderIndex,
      },
    })

    return NextResponse.json({ success: true, question })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to create question' },
      { status: 500 }
    )
  }
}

// PUT - Update a question
export async function PUT(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || user.role !== 'HR') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id, questionText, questionType, maxRating, orderIndex } = await request.json()

    if (!id || !questionText) {
      return NextResponse.json(
        { error: 'ID and question text are required' },
        { status: 400 }
      )
    }

    const question = await prisma.evaluationQuestion.update({
      where: { id },
      data: {
        questionText,
        questionType: questionType || 'RATING',
        maxRating: maxRating || 4,
        orderIndex: orderIndex || undefined,
      },
    })

    return NextResponse.json({ success: true, question })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to update question' },
      { status: 500 }
    )
  }
}

// DELETE - Delete a question
export async function DELETE(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || user.role !== 'HR') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Question ID is required' }, { status: 400 })
    }

    // Check if question has evaluations
    const question = await prisma.evaluationQuestion.findUnique({
      where: { id },
      include: {
        _count: {
          select: { evaluations: true },
        },
      },
    })

    if (question && question._count.evaluations > 0) {
      return NextResponse.json(
        { error: 'Cannot delete question with existing evaluations' },
        { status: 400 }
      )
    }

    await prisma.evaluationQuestion.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to delete question' },
      { status: 500 }
    )
  }
}
