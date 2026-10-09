import { escapeHtml } from '../sanitize'

export const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`

/** Monday's questions email. Every interpolated value is escaped. */
export function renderQuestionsEmail(input: { name: string; newCount: number; openCount: number; appUrl: string }): { subject: string; html: string } {
  const link = `${input.appUrl.replace(/\/$/, '')}/evaluations/weekly`
  const subject = 'Your evaluation questions for this week'
  const lead = `You have ${plural(input.newCount, 'new question')} this week (${input.openCount} open in total), due Sunday.`
  const html =
    '<div style="font-family:Arial,sans-serif;font-size:14px;color:#111;max-width:600px">' +
    `<p>Hi ${escapeHtml(input.name)},</p><p>${escapeHtml(lead)} Each one takes a few seconds: pick the statement that best fits what you have seen.</p>` +
    `<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;border-radius:6px;text-decoration:none">Answer now</a></p>` +
    '<p style="color:#666;font-size:12px">Unanswered questions stay open until the quarter closes.</p></div>'
  return { subject, html }
}

export function layout(name: string, paragraphs: string[], link: string, button: string): string {
  return (
    '<div style="font-family:Arial,sans-serif;font-size:14px;color:#111;max-width:600px">' +
    `<p>Hi ${escapeHtml(name)},</p>` +
    paragraphs.map((p) => `<p>${p}</p>`).join('') +
    `<p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 16px;background:#111;color:#fff;border-radius:6px;text-decoration:none">${escapeHtml(button)}</a></p></div>`
  )
}
export const base = (appUrl: string): string => appUrl.replace(/\/$/, '')

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
const LIST_WORDS = { PEER: ['as a peer', 'from their peers'], LEAD: ['as their lead', 'as their lead'], REPORT: ['to their team', 'from their team'] } as const

/** A change to someone's lists: their lead reviews it before HR decides; in a peer change the peer is told and may reply. */
export function renderPeerRequestEmail(input: { name: string; requesterName: string; peerName: string; action: 'ADD' | 'REMOVE'; relation?: 'PEER' | 'LEAD' | 'REPORT'; role: 'PEER' | 'LEAD'; periodName: string; link: string; reminder?: boolean }): { subject: string; html: string } {
  const change = input.action === 'ADD' ? 'add' : 'remove'
  const verb = LIST_WORDS[input.relation ?? 'PEER'][input.action === 'ADD' ? 0 : 1]
  const asked = (about: string) => `${input.requesterName} asked to ${change} ${about} ${verb} for ${input.periodName}. Peers evaluate each other during the quarter.`
  if (input.role === 'PEER') {
    return {
      subject: `${input.requesterName} asked to ${change} you ${verb} for ${input.periodName}`,
      html: layout(input.name, [
        escapeHtml(asked('you')),
        escapeHtml('Their lead and HR decide. You do not need to do anything, but you can say whether you work together.'),
      ], input.link, 'Reply (optional)'),
    }
  }
  return {
    subject: `${input.reminder ? 'Reminder: ' : ''}${input.requesterName} asked to change their evaluation list for ${input.periodName}`,
    html: layout(input.name, [
      escapeHtml(asked(input.peerName)),
      escapeHtml(input.reminder ? 'This has waited 2 working days for your review, and HR can see that.' : 'As their lead, please say whether you agree. HR makes the final decision.'),
    ], input.link, 'Review the request'),
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

type Change = { action: 'ADD' | 'REMOVE'; relation: 'PEER' | 'LEAD' | 'REPORT' }
/** "add Cara Lindqvist to your team", from the requester's side. */
const yourChange = (c: Change, other: string) => `${ACTION_WORDS[c.action]} ${other} ${RELATION_WORDS[c.relation][c.action === 'ADD' ? 0 : 1]}`
/** "add Cara Lindqvist to their team", about the requester. */
const theirChange = (c: Change, other: string) => `${ACTION_WORDS[c.action]} ${other} ${LIST_WORDS[c.relation][c.action === 'ADD' ? 0 : 1]}`
const HR_REQUESTS = '/admin/evaluation-round?tab=people'

/** A lead or team change was received (UX spec, section 13): who looks at it next. */
export function renderRequestReceivedEmail(input: Change & { name: string; otherName: string; leadName: string | null; appUrl: string }): { subject: string; html: string } {
  return {
    subject: `We got your request: ${yourChange(input, input.otherName)}`,
    html: layout(input.name, [
      escapeHtml(input.leadName ? `${input.leadName} reviews it first, then HR decides.` : 'HR decides, and you will hear the outcome.'),
      escapeHtml('You can follow it, or cancel it, on your evaluations page.'),
    ], `${base(input.appUrl)}/evaluations/weekly`, 'See your request'),
  }
}

/** A request is HR's to decide: straight away with no lead to review it, or once the lead has. */
export function renderRequestForHrEmail(input: Change & { name: string; requesterName: string; otherName: string; lead: { name: string; agrees: boolean; note: string | null } | null; appUrl: string }): { subject: string; html: string } {
  const lead = input.lead
  const review = !lead
    ? 'No lead reviews this one first, so it came straight to you.'
    : `${lead.name} ${lead.agrees ? 'agrees' : 'disagrees'}${lead.note ? `: ${lead.note}` : '.'}`
  return {
    subject: `To decide: ${input.requesterName} asked to ${theirChange(input, input.otherName)}`,
    html: layout(input.name, [escapeHtml(review)], `${base(input.appUrl)}${HR_REQUESTS}`, 'Decide'),
  }
}

/** The peer said whether they work with the requester: for the lead who reviews the request, and HR. */
export function renderPeerReplyEmail(input: { name: string; peerName: string; requesterName: string; worksTogether: boolean; forHr: boolean; appUrl: string }): { subject: string; html: string } {
  return {
    subject: `${input.peerName} says they ${input.worksTogether ? 'do' : 'don’t'} work with ${input.requesterName}`,
    html: layout(input.name, [
      escapeHtml(`This is about ${input.requesterName}’s request to change their peers. It is shown with the request and does not decide it.`),
    ], `${base(input.appUrl)}${input.forHr ? HR_REQUESTS : '/evaluations/weekly'}`, input.forHr ? 'See the request' : 'Open evaluations'),
  }
}

/** HR decided a change about this person: a peer hears either way; a lead or team member hears when it is applied. */
export function renderChangeForOtherEmail(input: Change & { name: string; requesterName: string; periodName: string; approved: boolean; note?: string | null; appUrl: string }): { subject: string; html: string } {
  const who = input.requesterName
  const add = input.action === 'ADD'
  const applied: Record<Change['relation'], string> = {
    PEER: add ? `${who} is now your peer for ${input.periodName}` : `${who} is no longer your peer for ${input.periodName}`,
    // The requester changed their lead: this person is the lead.
    LEAD: add ? `${who} is now on your team for ${input.periodName}` : `${who} is no longer on your team for ${input.periodName}`,
    // The requester changed their team: this person is the team member.
    REPORT: add ? `Your lead for ${input.periodName} is now ${who}` : `${who} is no longer your lead for ${input.periodName}`,
  }
  const subject = input.approved ? applied[input.relation] : `Not approved: ${who}’s request about you`
  return {
    subject,
    html: layout(input.name, [
      escapeHtml(input.approved ? `${subject}. Your evaluation questions follow it.` : `HR did not approve ${who}’s request to ${add ? 'add you as a peer' : 'remove you from their peers'}.`),
      ...(input.note ? [`Reason: <em>${escapeHtml(input.note)}</em>`] : []),
    ], `${base(input.appUrl)}/evaluations/weekly`, 'See your lists'),
  }
}

/** Pre-evaluation: who someone works with for the quarter, and how to ask for a peer change. */
export function renderMappingEmail(input: { name: string; periodName: string; leads: string[]; reports: string[]; peers: string[]; deadline?: string | null; appUrl: string }): { subject: string; html: string } {
  const list = (names: string[]) => (names.length ? names.map(escapeHtml).join(', ') : 'None')
  return {
    subject: input.deadline ? `Check your ${input.periodName} evaluation lists by ${input.deadline}` : `Your evaluation mapping for ${input.periodName}`,
    html: layout(input.name, [
      escapeHtml(`Here is who you work with for ${input.periodName}. You will answer short weekly questions about these people, and they about you.`),
      `<strong>Your lead:</strong> ${list(input.leads)}`,
      `<strong>Your reporting team members:</strong> ${list(input.reports)}`,
      `<strong>Your peers:</strong> ${list(input.peers)}`,
      escapeHtml('If anyone is wrong or missing, ask for a change on the page below. Your lead reviews each change first, then HR decides. If everything is right, say so there.'),
    ], `${base(input.appUrl)}/evaluations/weekly`, 'Review your mapping'),
  }
}

/** A change request nobody decided before the round opened; `requestedBy` when telling the peer it was about. */
export function renderRequestExpiredEmail(input: { name: string; otherName: string; requestedBy?: string; appUrl: string }): { subject: string; html: string } {
  if (input.requestedBy) {
    return {
      subject: `${input.requestedBy}’s request about you was not decided in time`,
      html: layout(input.name, [escapeHtml(`${input.requestedBy}’s request about you was not decided before evaluations started, so nothing changed.`)], `${base(input.appUrl)}/evaluations/weekly`, 'See your lists'),
    }
  }
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

/** A self-evaluation reached the lead (UX spec, section 12). */
export function renderSelfReviewSubmittedEmail(input: { name: string; personName: string; monthName: string; reminder?: boolean; appUrl: string }): { subject: string; html: string } {
  return {
    subject: `${input.reminder ? 'Reminder: ' : ''}${input.personName} has submitted their self-evaluation for ${input.monthName}`,
    html: layout(input.name, [
      escapeHtml(input.reminder
        ? `${input.personName}'s self-evaluation for ${input.monthName} has waited 5 working days for you to read it, and HR can see that.`
        : `${input.personName} has submitted their self-evaluation for ${input.monthName}. Read it, mark it read, and reply if you want to.`),
    ], `${base(input.appUrl)}/evaluations/weekly`, 'Read it'),
  }
}

/** The lead replied to a self-evaluation. */
export function renderSelfReviewReplyEmail(input: { name: string; leadName: string; monthName: string; appUrl: string }): { subject: string; html: string } {
  return {
    subject: `${input.leadName} replied to your self-evaluation for ${input.monthName}`,
    html: layout(input.name, [escapeHtml(`${input.leadName} replied to your self-evaluation for ${input.monthName}.`)], `${base(input.appUrl)}/evaluations/weekly`, 'See the reply'),
  }
}
