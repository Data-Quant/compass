import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { getSession } from '@/lib/auth'
import { stripHtml } from '@/lib/sanitize'
import {
  AVATAR_ACCESSORIES,
  AVATAR_ACCENT_COLORS,
  AVATAR_BODY_FRAMES,
  AVATAR_HAIR_CATEGORIES,
  AVATAR_HEAD_COVERING_TYPES,
  AVATAR_HIJAB_COLORS,
  AVATAR_OUTFIT_COLORS,
  AVATAR_OUTFIT_TYPES,
} from '@/shared/avatar-v2'

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
  avatarSkinTone: hexColor.nullable().optional(),
  avatarBodyFrame: z.enum(AVATAR_BODY_FRAMES).nullable().optional(),
  avatarOutfitType: z.enum(AVATAR_OUTFIT_TYPES).nullable().optional(),
  avatarOutfitColor: hexColor.refine((value) => AVATAR_OUTFIT_COLORS.includes(value as any)).nullable().optional(),
  avatarOutfitAccentColor: hexColor.refine((value) => AVATAR_ACCENT_COLORS.includes(value as any)).nullable().optional(),
  avatarHairCategory: z.enum(AVATAR_HAIR_CATEGORIES).nullable().optional(),
  avatarHeadCoveringType: z.enum(AVATAR_HEAD_COVERING_TYPES).nullable().optional(),
  avatarHeadCoveringColor: hexColor.refine((value) => AVATAR_HIJAB_COLORS.includes(value as any)).nullable().optional(),
  avatarAccessories: z.array(z.enum(AVATAR_ACCESSORIES)).max(3).nullable().optional(),
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
    if (
      'avatarBodyFrame' in data ||
      'avatarOutfitType' in data ||
      'avatarHeadCoveringType' in data
    ) {
      data.avatarSchemaVersion = 2
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
        avatarSkinTone: true,
        avatarSchemaVersion: true,
        avatarBodyFrame: true,
        avatarOutfitType: true,
        avatarOutfitColor: true,
        avatarOutfitAccentColor: true,
        avatarHairCategory: true,
        avatarHeadCoveringType: true,
        avatarHeadCoveringColor: true,
        avatarAccessories: true,
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
