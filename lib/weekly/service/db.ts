import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

export type Db = typeof prisma | Prisma.TransactionClient

export function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

/** Locks one answer's row until the transaction ends, so scoring, decisions and corrections on it never interleave. */
export async function lockResponse(tx: Prisma.TransactionClient, responseId: string): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "WeeklyResponse" WHERE id = ${responseId} FOR UPDATE`
  return rows.length === 1
}
