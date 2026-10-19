import test from 'node:test'
import assert from 'node:assert/strict'
import { renderQuestionsEmail } from '../lib/weekly/emails'
import { renderDueTodayEmail, renderRoundOpenedEmail } from '../lib/weekly/emails-round'

test('the round-opened email says in red that evaluations are open and when they are due', () => {
  const email = renderRoundOpenedEmail({ name: 'Ana', periodName: 'Q4 2026', questionWeeks: 12, closesOn: '3 Jan 2027', firstDueOn: 'Sun 4 Oct', appUrl: 'https://compass.example' })
  // New questions come in HR's question weeks only; the catch-up weeks are named separately.
  assert.match(email.html, /For 12 weeks you get a few short questions each week/)
  assert.match(email.html, /by Friday/)
  assert.match(email.html, /2 catch-up weeks/)
  assert.equal(email.subject, 'Q4 2026 evaluations are now open: first questions due Sun 4 Oct, closing 3 Jan 2027')
  const banner = email.html.match(/<div[^>]*#dc2626[^>]*>([\s\S]*?)<\/div>/)
  assert.ok(banner, 'a red banner leads the email')
  assert.match(banner[1], /Q4 2026 evaluations are now open/)
  assert.match(banner[1], /Sun 4 Oct/)
  assert.match(banner[1], /3 Jan 2027/)
  assert.ok(email.html.indexOf('#dc2626') < email.html.indexOf('For 12 weeks'), 'the banner comes before the explanation')
})

test('the Monday email counts new and open questions and links to the inbox', () => {
  const email = renderQuestionsEmail({ name: 'Ana', newCount: 2, openCount: 3, appUrl: 'https://compass.example/' })
  assert.equal(email.subject, 'Your evaluation questions for this week')
  assert.match(email.html, /2 new questions/)
  assert.match(email.html, /3 open in total/)
  assert.match(email.html, /href="https:\/\/compass\.example\/evaluations\/weekly"/)
})

test('the due-day email uses singular wording for one question', () => {
  assert.equal(renderDueTodayEmail({ name: 'Ana', openCount: 1, appUrl: 'https://compass.example' }).subject, 'Your 1 remaining question is due today')
  assert.equal(renderDueTodayEmail({ name: 'Ana', openCount: 3, appUrl: 'https://compass.example' }).subject, 'Your 3 remaining questions are due today')
})

test('names are escaped', () => {
  const email = renderQuestionsEmail({ name: '<script>x</script>', newCount: 1, openCount: 1, appUrl: 'https://compass.example' })
  assert.doesNotMatch(email.html, /<script/i)
  assert.match(email.html, /&lt;script&gt;/)
})
