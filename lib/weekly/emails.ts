import { escapeHtml } from '../sanitize'

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/** Monday's questions email and the daily reminder. Every interpolated value is escaped. */
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
    `<p>Hi ${escapeHtml(input.name)},</p><p>${escapeHtml(lead)} Each one takes a few seconds: pick the statement that best fits what you have seen.</p>` +
    `<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;border-radius:6px;text-decoration:none">Answer now</a></p>` +
    '<p style="color:#666;font-size:12px">Unanswered questions stay open until the quarter closes.</p></div>'
  return { subject, html }
}

function layout(name: string, paragraphs: string[], link: string, button: string): string {
  return (
    '<div style="font-family:Arial,sans-serif;font-size:14px;color:#111;max-width:600px">' +
    `<p>Hi ${escapeHtml(name)},</p>` +
    paragraphs.map((p) => `<p>${p}</p>`).join('') +
    `<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;border-radius:6px;text-decoration:none">${escapeHtml(button)}</a></p></div>`
  )
}
const base = (appUrl: string) => appUrl.replace(/\/$/, '')

const MAX_EMAIL_ROWS = 50

export function renderLowEvidenceEmail(input: { name: string; rows: ReadonlyArray<{ evaluatee: string; group: string; satisfied: number; total: number }>; appUrl: string }): { subject: string; html: string } {
  const shown = input.rows.slice(0, MAX_EMAIL_ROWS)
  const table =
    '<table style="border-collapse:collapse;font-size:13px">' +
    '<tr><th align="left" style="padding:4px 8px">Person</th><th align="left" style="padding:4px 8px">Group</th><th align="left" style="padding:4px 8px">Topics answered</th></tr>' +
    shown.map((r) => `<tr><td style="padding:4px 8px">${escapeHtml(r.evaluatee)}</td><td style="padding:4px 8px">${escapeHtml(r.group)}</td><td style="padding:4px 8px">${r.satisfied} of ${r.total}</td></tr>`).join('') +
    '</table>'
  const more = input.rows.length > shown.length ? `<p>…and ${input.rows.length - shown.length} more on the dashboard.</p>` : ''
  return {
    subject: `Weekly evaluations: ${plural(input.rows.length, 'person-group')} with low evidence`,
    html: layout(input.name, [
      escapeHtml('These people have answers on less than 60% of their topics in a group, with two question weeks left.'),
      table + more,
    ], `${base(input.appUrl)}/admin/evaluation-round?tab=progress`, 'Open the dashboard'),
  }
}

export function renderFormsOpenEmail(input: { name: string; appUrl: string; path?: string }): { subject: string; html: string } {
  return {
    subject: 'End-of-quarter evaluation forms are open',
    html: layout(input.name, [escapeHtml('Your end-of-quarter evaluation forms (C-Level, Department or HR) are open. Please complete them before the quarter closes.')], `${base(input.appUrl)}${input.path ?? '/evaluations/weekly'}`, 'Open the forms'),
  }
}

const ACTION_WORDS = { ADD: 'add', REMOVE: 'remove' } as const

/** A peer change needs this person's approval: one click on the page the link opens. Every value is escaped. */
/** A peer change: the requester's lead decides it; the peer is told and may say whether they work together. */
export function renderPeerRequestEmail(input: { name: string; requesterName: string; peerName: string; action: 'ADD' | 'REMOVE'; role: 'PEER' | 'LEAD'; periodName: string; link: string; reminder?: boolean }): { subject: string; html: string } {
  const change = input.action === 'ADD' ? 'add' : 'remove'
  const verb = input.action === 'ADD' ? 'as a peer' : 'from their peers'
  const asked = (about: string) => `${input.requesterName} asked to ${change} ${about} ${verb} for ${input.periodName}. Peers evaluate each other during the quarter.`
  if (input.role === 'PEER') {
    return {
      subject: `${input.requesterName} asked to ${change} you ${verb} for ${input.periodName}`,
      html: layout(input.name, [
        escapeHtml(asked('you')),
        escapeHtml('Their lead decides. You do not need to do anything, but you can tell them whether you work together.'),
      ], input.link, 'Reply (optional)'),
    }
  }
  return {
    subject: `${input.reminder ? 'Reminder: ' : ''}${input.requesterName} asked to ${change} a peer for ${input.periodName}`,
    html: layout(input.name, [
      escapeHtml(asked(input.peerName)),
      escapeHtml(input.reminder ? 'This has waited 2 working days for your decision, and HR can see that.' : 'As their lead, you decide.'),
    ], input.link, 'Approve or decline'),
  }
}

/** HR needs more information before deciding a change to someone's lists. */
export function renderMappingQuestionEmail(input: { name: string; otherName: string; question: string; appUrl: string }): { subject: string; html: string } {
  return {
    subject: 'HR has a question about your list change',
    html: layout(input.name, [
      escapeHtml(`HR has a question about your request about ${input.otherName}:`),
      `<em>${escapeHtml(input.question)}</em>`,
      escapeHtml('Answer it on your evaluations page, and HR will decide.'),
    ], `${base(input.appUrl)}/evaluations/weekly`, 'Answer HR'),
  }
}

const RELATION_WORDS = { PEER: ['as a peer', 'from your peers'], LEAD: ['as your lead', 'as your lead'], REPORT: ['to your team', 'from your team'] } as const

export function renderPeerOutcomeEmail(input: { name: string; peerName: string; action: 'ADD' | 'REMOVE'; relation: 'PEER' | 'LEAD' | 'REPORT'; approved: boolean; note?: string | null; appUrl: string }): { subject: string; html: string } {
  const change = `${ACTION_WORDS[input.action]} ${input.peerName} ${RELATION_WORDS[input.relation][input.action === 'ADD' ? 0 : 1]}`
  return {
    subject: input.approved ? `Approved: ${change}` : `Not approved: ${change}`,
    html: layout(input.name, [
      escapeHtml(input.approved ? `Your request to ${change} was approved.` : `Your request to ${change} was not approved.`),
      ...(input.note ? [`Reason: <em>${escapeHtml(input.note)}</em>`] : []),
    ], `${base(input.appUrl)}/evaluations/weekly`, 'See your mapping'),
  }
}

/** Pre-evaluation: who someone works with for the quarter, and how to ask for a peer change. */
export function renderMappingEmail(input: { name: string; periodName: string; leads: string[]; reports: string[]; peers: string[]; appUrl: string }): { subject: string; html: string } {
  const list = (names: string[]) => (names.length ? names.map(escapeHtml).join(', ') : 'None')
  return {
    subject: `Your evaluation mapping for ${input.periodName}`,
    html: layout(input.name, [
      escapeHtml(`Here is who you work with for ${input.periodName}. You will answer short weekly questions about these people, and they about you.`),
      `<strong>Your lead:</strong> ${list(input.leads)}`,
      `<strong>Your reporting team members:</strong> ${list(input.reports)}`,
      `<strong>Your peers:</strong> ${list(input.peers)}`,
      escapeHtml('If anyone is wrong or missing, ask for a change on the page below. A peer change happens once your lead approves; HR decides changes to your lead or team. If everything is right, say so there.'),
    ], `${base(input.appUrl)}/evaluations/weekly`, 'Review your mapping'),
  }
}

/** A change request nobody decided before the round opened. */
export function renderRequestExpiredEmail(input: { name: string; otherName: string; appUrl: string }): { subject: string; html: string } {
  return {
    subject: 'Your evaluation list request was not decided in time',
    html: layout(input.name, [
      escapeHtml(`Your request about ${input.otherName} was not decided before evaluations started, so your lists stay as they are.`),
      escapeHtml('If it still matters, contact HR: they can change your lists during the round.'),
    ], `${base(input.appUrl)}/evaluations/weekly`, 'See your lists'),
  }
}

/** HR changed someone's evaluation lists during a round (UX spec, section 13: "Override during round"). */
export function renderListChangedEmail(input: { name: string; change: string; appUrl: string }): { subject: string; html: string } {
  return {
    subject: 'Your evaluation list changed',
    html: layout(input.name, [escapeHtml(input.change), escapeHtml('Answers you already gave still count. Any new questions start next week.')], `${base(input.appUrl)}/evaluations/weekly`, 'See your lists'),
  }
}
