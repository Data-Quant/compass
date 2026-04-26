import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import {
  AVATAR_ACCESSORIES,
  AVATAR_BODY_FRAMES,
  AVATAR_HAIR_CATEGORIES,
  AVATAR_HEAD_COVERING_TYPES,
  AVATAR_HIJAB_COLORS,
  AVATAR_OUTFIT_COLORS,
  AVATAR_OUTFIT_TYPES,
  AVATAR_ACCENT_COLORS,
} from '@/shared/avatar-v2'

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid color')
const colorFrom = (palette: readonly string[]) => hexColor.refine(
  (value) => palette.some((item) => item.toLowerCase() === value.toLowerCase()),
  'Color is not in the approved avatar palette'
)

const avatarV2Schema = z.object({
  avatarBodyFrame: z.enum(AVATAR_BODY_FRAMES),
  avatarOutfitType: z.enum(AVATAR_OUTFIT_TYPES),
  avatarOutfitColor: colorFrom(AVATAR_OUTFIT_COLORS),
  avatarOutfitAccentColor: colorFrom(AVATAR_ACCENT_COLORS),
  avatarHairCategory: z.enum(AVATAR_HAIR_CATEGORIES),
  avatarSkinTone: hexColor,
  avatarHeadCoveringType: z.enum(AVATAR_HEAD_COVERING_TYPES),
  avatarHeadCoveringColor: colorFrom(AVATAR_HIJAB_COLORS).nullable().optional(),
  avatarAccessories: z.array(z.enum(AVATAR_ACCESSORIES)).max(3).default([]),
}).strict().superRefine((value, context) => {
  if (value.avatarHeadCoveringType === 'hijab' && value.avatarBodyFrame !== 'feminine') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['avatarHeadCoveringType'],
      message: 'Hijab is currently available for feminine avatars',
    })
  }
  if (value.avatarHeadCoveringType === 'hijab' && value.avatarHairCategory !== 'covered') {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['avatarHairCategory'],
      message: 'Covered hair category is required when hijab is selected',
    })
  }
})

export async function PATCH(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const parsed = avatarV2Schema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid avatar', details: parsed.error.errors }, { status: 400 })
    }

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        avatarSchemaVersion: 2,
        avatarBodyFrame: parsed.data.avatarBodyFrame,
        avatarOutfitType: parsed.data.avatarOutfitType,
        avatarOutfitColor: parsed.data.avatarOutfitColor,
        avatarOutfitAccentColor: parsed.data.avatarOutfitAccentColor,
        avatarHairCategory: parsed.data.avatarHairCategory,
        avatarSkinTone: parsed.data.avatarSkinTone,
        avatarHeadCoveringType: parsed.data.avatarHeadCoveringType,
        avatarHeadCoveringColor:
          parsed.data.avatarHeadCoveringType === 'hijab'
            ? parsed.data.avatarHeadCoveringColor || AVATAR_HIJAB_COLORS[0]
            : null,
        avatarAccessories: parsed.data.avatarAccessories,
      },
      select: {
        id: true,
        avatarSchemaVersion: true,
        avatarBodyFrame: true,
        avatarOutfitType: true,
        avatarOutfitColor: true,
        avatarOutfitAccentColor: true,
        avatarHairCategory: true,
        avatarSkinTone: true,
        avatarHeadCoveringType: true,
        avatarHeadCoveringColor: true,
        avatarAccessories: true,
      },
    })

    return NextResponse.json({ success: true, user: updatedUser })
  } catch (error) {
    console.error('Failed to update office avatar:', error)
    return NextResponse.json({ error: 'Failed to update office avatar' }, { status: 500 })
  }
}
