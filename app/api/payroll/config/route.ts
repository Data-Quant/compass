import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { canManagePayroll } from '@/lib/permissions'
import { getDocuSignRuntimeConfig } from '@/lib/payroll/config'

const configSchema = z.object({
  templateId: z.string().trim().min(1),
  templateRoleName: z.string().trim().min(1).default('Employee'),
  active: z.boolean().default(true),
})

export async function GET() {
  try {
    const user = await getSession()
    if (!user || !canManagePayroll(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const config = await prisma.payrollConfig.findFirst({
      orderBy: { updatedAt: 'desc' },
    })
    const runtime = getDocuSignRuntimeConfig()

    return NextResponse.json({
      config,
      runtime: {
        ready: runtime.ready,
        missing: runtime.missing,
        oauthBasePath: runtime.oauthBasePath,
        basePath: runtime.basePath,
      },
    })
  } catch (error) {
    console.error('Failed to fetch payroll config:', error)
    return NextResponse.json({ error: 'Failed to fetch payroll config' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const user = await getSession()
    if (!user || !canManagePayroll(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const parsed = configSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request payload', details: parsed.error.errors },
        { status: 400 }
      )
    }

    const existing = await prisma.payrollConfig.findFirst({
      orderBy: { createdAt: 'asc' },
    })

    const config = existing
      ? await prisma.payrollConfig.update({
          where: { id: existing.id },
          data: {
            templateId: parsed.data.templateId,
            templateRoleName: parsed.data.templateRoleName,
            active: parsed.data.active,
          },
        })
      : await prisma.payrollConfig.create({
          data: {
            templateId: parsed.data.templateId,
            templateRoleName: parsed.data.templateRoleName,
            active: parsed.data.active,
          },
        })

    return NextResponse.json({ success: true, config })
  } catch (error) {
    console.error('Failed to update payroll config:', error)
    return NextResponse.json({ error: 'Failed to update payroll config' }, { status: 500 })
  }
}
