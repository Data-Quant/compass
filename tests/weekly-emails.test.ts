import test from 'node:test'
import assert from 'node:assert/strict'
import { renderQuestionsEmail } from '../lib/weekly/emails'
import { renderDueTodayEmail } from '../lib/weekly/emails-round'

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
  assert.doesNotMatch(email.html, /<script>/)
  assert.match(email.html, /&lt;script&gt;/)
})
