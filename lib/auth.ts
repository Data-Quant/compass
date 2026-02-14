import { cookies } from 'next/headers'
import { getIronSession } from 'iron-session'
import { prisma } from '@/lib/db'
import { sessionOptions, SessionData } from '@/lib/session'

export type SafeUser = {
  id: string
  name: string
  email: string | null
  department: string | null
  position: string | null
  role: 'EMPLOYEE' | 'HR' | 'SECURITY' | 'OA'
  createdAt: Date
  updatedAt: Date
  chartX: number | null
  chartY: number | null
}

export async function getSession(): Promise<SafeUser | null> {
  const cookieStore = await cookies()
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions)

  if (!session.userId) {
    return null
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      name: true,
      email: true,
      department: true,
      position: true,
      role: true,
      createdAt: true,
      updatedAt: true,
      chartX: true,
      chartY: true,
      passwordVersion: true,
    },
  })

  if (!user) {
    return null
  }

  // Verify passwordVersion matches session
  if (user.passwordVersion !== session.passwordVersion) {
    session.destroy()
    return null
  }

  // Return user without passwordVersion
  const { passwordVersion, ...safeUser } = user
  return safeUser
}

export async function setSession(userId: string) {
  const cookieStore = await cookies()
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions)

  // Fetch current passwordVersion
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordVersion: true },
  })

  session.userId = userId
  session.passwordVersion = user?.passwordVersion ?? 0
  await session.save()
}

export async function clearSession() {
  const cookieStore = await cookies()
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions)
  session.destroy()
}
