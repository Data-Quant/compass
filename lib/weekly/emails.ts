import { escapeHtml } from '../sanitize'

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/** Monday's questions email and Thursday's reminder. Every interpolated value is escaped. */
export function renderQuestionsEmail(input: { name: string; newCount: number; openCount: number; appUrl: string; reminder: boolean }): { subject: string; html: string } {
  const link = `${input.appUrl.replace(/\/$/, '')}/evaluations/weekly`
  const subject = input.reminder
    ? `Reminder: ${plural(input.openCount, 'evaluation question')} ${input.openCount === 1 ? 'is' : 'are'} waiting`
    : 'Your evaluation questions for this week'
  const lead = input.reminder
    ? `You have ${plural(input.openCount, 'evaluation question')} waiting.`
    : `You have ${plural(input.newCount, 'new question')} this week (${input.openCount} open in total).`
  const html =
    '<div style="font-family:Arial,sans-serif;font-size:14px;color:#111;max-width:600px">' +
    `<p>Hi ${escapeHtml(input.name)},</p><p>${escapeHtml(lead)} Each takes about five minutes: describe a real situation, what the person did, and what happened.</p>` +
    `<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;border-radius:6px;text-decoration:none">Answer now</a></p>` +
    '<p style="color:#666;font-size:12px">Unanswered questions stay open until the quarter closes.</p></div>'
  return { subject, html }
}
