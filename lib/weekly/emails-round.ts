// The round's scheduled emails (UX spec, section 13). One button to the page that acts on it; every value is escaped.
import { escapeHtml } from '../sanitize'
import { base, layout, plural } from './emails'

type Email = { subject: string; html: string }
const MY_PAGE = '/evaluations/weekly'
const people = (count: number) => (count === 1 ? '1 person' : `${count} people`)

export function renderReviewReminderEmail(input: { name: string; periodName: string; deadline: string; appUrl: string }): Email {
  return {
    subject: `2 days left to check your ${input.periodName} evaluation lists`,
    html: layout(input.name, [
      escapeHtml(`Please check your lead, team and peers for ${input.periodName} by ${input.deadline}.`),
      escapeHtml('Say they look right, or ask for a change. After that, changes go through HR.'),
    ], `${base(input.appUrl)}${MY_PAGE}`, 'Check your lists'),
  }
}

export function renderRoundOpenedEmail(input: { name: string; periodName: string; weeks: number; closesOn: string; appUrl: string }): Email {
  return {
    subject: `${input.periodName} evaluations have started: ${input.weeks} weeks, closing ${input.closesOn}`,
    html: layout(input.name, [
      escapeHtml('Each Monday you get a few short questions about the people you work with. Pick the statement that fits what you have seen; each takes a few seconds.'),
      escapeHtml(`Answer each week’s questions by Sunday. Anything you miss stays open until the round closes on ${input.closesOn}.`),
    ], `${base(input.appUrl)}${MY_PAGE}`, 'See this week’s questions'),
  }
}

export function renderDueTodayEmail(input: { name: string; openCount: number; appUrl: string }): Email {
  const sentence = `Your ${plural(input.openCount, 'remaining question')} ${input.openCount === 1 ? 'is' : 'are'} due today`
  return {
    subject: sentence,
    html: layout(input.name, [escapeHtml(`${sentence}. Each one takes a few seconds.`)], `${base(input.appUrl)}${MY_PAGE}`, 'Answer now'),
  }
}

export function renderFinalWeekEmail(input: { name: string; openCount: number; closesOn: string; appUrl: string }): Email {
  return {
    subject: `${plural(input.openCount, 'question')} left before ${input.closesOn}`,
    html: layout(input.name, [
      escapeHtml(`This is the last week of the round. You have ${plural(input.openCount, 'unanswered question')}; after ${input.closesOn} they can no longer be answered.`),
    ], `${base(input.appUrl)}${MY_PAGE}`, 'Answer now'),
  }
}

/** HR's own nudge from the Progress tab. */
export function renderHrReminderEmail(input: { name: string; openCount: number; appUrl: string }): Email {
  return {
    subject: `Reminder from HR: ${plural(input.openCount, 'evaluation question')} waiting`,
    html: layout(input.name, [escapeHtml(`You have ${plural(input.openCount, 'open evaluation question')}. Each takes a few seconds.`)], `${base(input.appUrl)}${MY_PAGE}`, 'Answer now'),
  }
}

export function renderBehindEmail(input: { name: string; openCount: number; appUrl: string }): Email {
  return {
    subject: `You have ${plural(input.openCount, 'unanswered evaluation question')}`,
    html: layout(input.name, [
      escapeHtml(`You have ${plural(input.openCount, 'unanswered question')}, some from two or more weeks ago. Each takes a few seconds, and your answers are what your colleagues’ reviews are built on.`),
    ], `${base(input.appUrl)}${MY_PAGE}`, 'Catch up'),
  }
}

/** D-E3: a lead hears when someone on their team is 2 or more weeks behind. */
export function renderTeamBehindEmail(input: { name: string; people: ReadonlyArray<{ name: string; openCount: number }>; appUrl: string }): Email {
  const rows = input.people.map((p) => `<li>${escapeHtml(p.name)}: ${escapeHtml(plural(p.openCount, 'unanswered question'))}</li>`).join('')
  return {
    subject: `${people(input.people.length)} on your team ${input.people.length === 1 ? 'is' : 'are'} behind on evaluation questions`,
    html: layout(input.name, [
      escapeHtml('These people on your team still have questions from two or more weeks ago:'),
      `<ul>${rows}</ul>`,
      escapeHtml('A short nudge from you usually helps.'),
    ], `${base(input.appUrl)}${MY_PAGE}`, 'Open evaluations'),
  }
}

export interface HrDigestFacts {
  periodName: string; week: number; totalWeeks: number; answered: number; asked: number; behind: number
  waitingReview: number; lowEvidence: number; openRequests: number; unreadSelfReviews: number
}

/** HR's Monday summary of the round. */
export function renderHrDigestEmail(input: HrDigestFacts & { name: string; appUrl: string }): Email {
  const percent = input.asked ? Math.round((input.answered / input.asked) * 100) : 0
  const line = (label: string, value: string) => `<li>${escapeHtml(label)}: <strong>${escapeHtml(value)}</strong></li>`
  return {
    subject: `${input.periodName} evaluations, week ${input.week} of ${input.totalWeeks}: ${percent}% answered`,
    html: layout(input.name, [
      `<ul>${[
        line('Questions answered so far', `${input.answered} of ${input.asked} (${percent}%)`),
        line('People 2 or more weeks behind', String(input.behind)),
        line('Answers waiting for your review', String(input.waitingReview)),
        line('People with low evidence in a group', String(input.lowEvidence)),
        line('List change requests waiting', String(input.openRequests)),
        line('Self-evaluations unread by a lead after 5 working days', String(input.unreadSelfReviews)),
      ].join('')}</ul>`,
    ], `${base(input.appUrl)}/admin/evaluation-round`, 'Open the round'),
  }
}

/** A late joiner gets no questions about them this round; their lead gives feedback in person instead. */
export function renderJoinerEmail(input: { name: string; joinerName: string; periodName: string; closesOn: string; reminder: boolean; appUrl: string }): Email {
  const link = `${base(input.appUrl)}${MY_PAGE}`
  if (input.reminder) {
    return {
      subject: `Reminder: feedback for ${input.joinerName}`,
      html: layout(input.name, [
        escapeHtml(`${input.periodName} evaluations close on ${input.closesOn}. ${input.joinerName} is not in this round, so if you have not yet, give them feedback in person.`),
      ], link, 'Open evaluations'),
    }
  }
  return {
    subject: `${input.joinerName} isn’t in the ${input.periodName} evaluations`,
    html: layout(input.name, [
      escapeHtml(`${input.joinerName} joined with too few weeks left to be evaluated this quarter, so nobody is asked about them.`),
      escapeHtml('Please give them feedback in person. They will be in the next round.'),
    ], link, 'Open evaluations'),
  }
}

export function renderRoundClosedEmail(input: { name: string; periodName: string; appUrl: string }): Email {
  return {
    subject: `${input.periodName} evaluations are closed`,
    html: layout(input.name, [escapeHtml('No more questions can be answered. HR will share your report when it is ready.')], `${base(input.appUrl)}${MY_PAGE}`, 'See your answers'),
  }
}
