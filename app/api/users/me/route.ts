import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { stripHtml } from '@/lib/sanitize'

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid color')
const sanitizedShortText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (typeof value === 'string' ? stripHtml(value) : value))

const profileUpdateSchema = z.object({
  email: z.string().trim().email().max(255).nullable().optional(),
  discordId: sanitizedShortText(100),
  avatarBodyType: z.enum(['male', 'female']).nullable().optional(),
  avatarHairStyle: z.number().int().min(0).max(4).nullable().optional(),
  avatarHairColor: hexColor.nullable().optional(),
  avatarSkinTone: hexColor.nullable().optional(),
  avatarShirtColor: hexColor.nullable().optional(),
}).strict()

export async function PUT(request: NextRequest) {
  try {
    const currentUser = await getSession()
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = profileUpdateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid profile payload', details: parsed.error.errors },
        { status: 400 }
      )
    }

    // Only write keys explicitly present in the request so omitted fields stay untouched.
    const data: Record<string, unknown> = {}
    for (const key of Object.keys(parsed.data) as Array<keyof typeof parsed.data>) {
      if (key in body) {
        const value = parsed.data[key]
        if (key === 'email' || key === 'discordId') {
          // Normalize empty strings to null for optional unique fields.
          data[key] = typeof value === 'string' && value.trim() === '' ? null : value ?? null
        } else {
          data[key] = value ?? null
        }
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const updatedUser = await prisma.user.update({
      where: { id: currentUser.id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        discordId: true,
        department: true,
        position: true,
        role: true,
        avatarBodyType: true,
        avatarHairStyle: true,
        avatarHairColor: true,
        avatarSkinTone: true,
        avatarShirtColor: true,
      },
    })

    return NextResponse.json({ success: true, user: updatedUser })
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as { code?: string }).code === 'P2002') {
      return NextResponse.json({ error: 'Email already exists' }, { status: 400 })
    }
    console.error('Failed to update profile details:', error)
    return NextResponse.json({ error: 'Failed to update profile details' }, { status: 500 })
  }
}
