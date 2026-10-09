import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { guardWeeklyMutation, requireWeeklySession } from '@/lib/weekly/http'
import { weeklyErrorResponse } from '@/lib/weekly/http-errors'
import { MAX_LIST_FILE_BYTES } from '@/lib/weekly/list-import'
import { actorFromUser } from '@/lib/weekly/service/context'
import { WeeklyError } from '@/lib/weekly/service/errors'
import { importRoundLists } from '@/lib/weekly/service/round-people'

export const dynamic = 'force-dynamic'

// Base64 is 4/3 of the file's size.
const importSchema = z.object({
  cycleId: z.string().min(1), fileName: z.string().trim().min(1).max(200),
  data: z.string().min(1).max(Math.ceil((MAX_LIST_FILE_BYTES * 4) / 3) + 4), apply: z.boolean(),
}).strict()

/** HR's spreadsheet of lists for a round: a preview of the changes, or the changes saved. */
export async function POST(request: NextRequest) {
  try {
    const user = await requireWeeklySession({ admin: true })
    await guardWeeklyMutation(request, user.id)
    const input = importSchema.parse(await request.json())
    const buffer = Buffer.from(input.data, 'base64')
    if (buffer.length === 0) throw new WeeklyError('The file is empty')
    const bytes = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
    return NextResponse.json(await importRoundLists(actorFromUser(user), input.cycleId, { name: input.fileName, bytes }, input.apply))
  } catch (error) {
    return weeklyErrorResponse(error)
  }
}
