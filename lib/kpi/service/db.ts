import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'

export type Db = typeof prisma | Prisma.TransactionClient

export function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

/** Runs fn inside a transaction, reusing the caller's transaction if db already is one. */
export async function inTransaction<T>(db: Db, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return '$transaction' in db ? db.$transaction(fn) : fn(db)
}
