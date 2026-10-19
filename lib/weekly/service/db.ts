import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

export type Db = typeof prisma | Prisma.TransactionClient

export function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

